import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { lastValueFrom } from 'rxjs';
import { TrustIdAuthService } from '../auth/auth.service';
import { TrustIdException } from '../common/exceptions/trustid.exception';
import type { TrustIdConfig } from '../config/trustid.config';

/**
 * TrustIdHttpService — the single gateway for ALL outbound calls to TrustID's API.
 *
 * WHY THIS EXISTS:
 * Every TrustID API call needs the same three auth headers:
 *   - Tid-Api-Key    (your API key, from config)
 *   - __TT_DeviceId  (your device identifier, from config)
 *   - __TT_SessionId (the current login session token — changes over time)
 *
 * If every service built these headers itself, we'd have a lot of copy-paste and
 * a single typo in one service would cause mysterious 401 errors. Instead, this
 * service handles headers automatically — other services just say "POST this body
 * to this path" and forget about auth entirely.
 *
 * HOW IT WORKS:
 * 1. Other services call post(), postBinary(), or get() with a path and payload.
 * 2. This service fetches the current SessionId from TrustIdAuthService.
 * 3. It builds the full URL and injects the required headers.
 * 4. It executes the request via @nestjs/axios's HttpService.
 * 5. If TrustID returns 401 (session expired), it refreshes the session and retries ONCE.
 * 6. Any other error is wrapped in a TrustIdException so callers get consistent errors.
 */
@Injectable()
export class TrustIdHttpService {
  private readonly logger = new Logger(TrustIdHttpService.name);

  constructor(
    // @nestjs/axios wrapper — returns RxJS Observables which we convert to Promises
    private readonly httpService: HttpService,
    // Provides the current session token and handles refresh on 401
    private readonly authService: TrustIdAuthService,
    // Reads baseUrl, deviceId, apiKey from environment variables
    private readonly configService: ConfigService,
  ) {}

  /**
   * Makes a JSON POST request to TrustID.
   * Use this for all normal API calls (create container, create document, etc.)
   *
   * @param path - API path, e.g. '/dataAccess/createDocumentContainer/'
   * @param body - JSON body to send (will be serialised automatically)
   * @returns The parsed JSON response body typed as T
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    // executeWithRetry handles the 401 → refresh → retry logic for us
    return this.executeWithRetry(() => this.doPost<T>(path, body));
  }

  /**
   * Makes a binary (octet-stream) POST request to TrustID.
   * TrustID requires this format for image uploads — you send the raw bytes of
   * the image file, not a JSON body. The image metadata (container ID, image type)
   * goes in the URL query string instead.
   *
   * @param path - API path, e.g. '/dataAccess/uploadImage/'
   * @param buffer - Raw image bytes (Buffer from a file upload or read)
   * @param queryParams - Key/value pairs appended to the URL as ?key=value&...
   *                      e.g. { __TT_ContainerId: 'abc', __TT_ImageType: 'DocumentFront' }
   */
  async postBinary(
    path: string,
    buffer: Buffer,
    queryParams: Record<string, string>,
  ): Promise<unknown> {
    return this.executeWithRetry(() =>
      this.doPostBinary(path, buffer, queryParams),
    );
  }

  /**
   * Makes a JSON GET request to TrustID.
   *
   * @param path - API path
   * @param params - Optional query parameters (appended to the URL automatically)
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.executeWithRetry(() => this.doGet<T>(path, params));
  }

  // ---------------------------------------------------------------------------
  // Private implementation methods — the public methods above delegate to these
  // ---------------------------------------------------------------------------

  private async doPost<T>(path: string, body: unknown): Promise<T> {
    const config = await this.buildConfig(); // adds auth headers
    const url = this.buildUrl(path);

    // lastValueFrom converts the RxJS Observable to a Promise we can await
    const response = await lastValueFrom(
      this.httpService.post<T>(url, body, config),
    );

    return response.data;
  }

  private async doPostBinary(
    path: string,
    buffer: Buffer,
    queryParams: Record<string, string>,
  ): Promise<unknown> {
    // Override Content-Type to octet-stream so TrustID knows we're sending raw bytes
    const config = await this.buildConfig({
      'Content-Type': 'application/octet-stream',
    });

    // Query params (__TT_ContainerId, __TT_ImageType, etc.) go in the URL, not the body
    const url = this.buildUrl(path, queryParams);

    const response: AxiosResponse = await lastValueFrom(
      this.httpService.post(url, buffer, config),
    );

    return response.data;
  }

  private async doGet<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const config = await this.buildConfig();
    const url = this.buildUrl(path);

    const response = await lastValueFrom(
      this.httpService.get<T>(url, { ...config, params }),
    );

    return response.data;
  }

  /**
   * Builds the Axios config object that gets merged into every request.
   * This is where the three required TrustID auth headers are injected.
   *
   * @param extraHeaders - Any additional headers to merge in (e.g. Content-Type override)
   */
  private async buildConfig(
    extraHeaders: Record<string, string> = {},
  ): Promise<AxiosRequestConfig> {
    const trustidConfig = this.configService.get<TrustIdConfig>('trustid')!;

    // getSessionId() returns the cached token and handles refresh automatically
    const sessionId = await this.authService.getSessionId();

    return {
      headers: {
        'Content-Type': 'application/json', // default; can be overridden by extraHeaders
        'Tid-Api-Key': trustidConfig.apiKey, // static API key — never changes
        __TT_DeviceId: trustidConfig.deviceId, // static device ID — never changes
        __TT_SessionId: sessionId, // dynamic session token — refreshed automatically
        ...extraHeaders, // any overrides (e.g. octet-stream) are applied last
      },
    };
  }

  /**
   * Constructs the full URL from the base URL + path + optional query string.
   *
   * Example:
   *   buildUrl('/dataAccess/uploadImage/', { __TT_ContainerId: 'abc', __TT_ImageType: 'DocumentFront' })
   *   → 'https://sandbox.trustid.co.uk/dataAccess/uploadImage/?__TT_ContainerId=abc&__TT_ImageType=DocumentFront'
   */
  private buildUrl(path: string, queryParams?: Record<string, string>): string {
    const trustidConfig = this.configService.get<TrustIdConfig>('trustid')!;

    // Strip trailing slash from base URL to avoid double slashes
    const base = trustidConfig.baseUrl.replace(/\/$/, '');

    // Ensure the path always starts with a slash
    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    if (!queryParams || Object.keys(queryParams).length === 0) {
      return `${base}${cleanPath}`;
    }

    // URLSearchParams handles URL-encoding special characters automatically
    const qs = new URLSearchParams(queryParams).toString();
    return `${base}${cleanPath}?${qs}`;
  }

  /**
   * Wraps every request with a 401-retry strategy.
   *
   * FLOW:
   *   1. Try the request (fn is a function that returns the Promise)
   *   2a. If it succeeds → return the result, done
   *   2b. If we get 401 → session token was rejected by TrustID
   *       - Ask TrustIdAuthService to refresh the session (new login)
   *       - Retry the request ONCE with the new token
   *       - If it fails again → throw TrustIdException (don't loop forever)
   *   2c. Any other error → wrap in TrustIdException and throw
   *
   * @param fn - A factory function (closure) that returns the Promise to execute.
   *             We pass a factory rather than a Promise so we can call it twice
   *             (Promises can only be awaited once; factories can be called again).
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      if (this.isUnauthorized(error)) {
        this.logger.warn(
          'Received 401 from TrustID — refreshing session and retrying',
        );
        await this.authService.forceRefresh();

        // Retry once. If this also fails, fall through to wrapError.
        try {
          return await fn();
        } catch (retryError: unknown) {
          throw this.wrapError(retryError);
        }
      }

      // Non-401 error (500, network timeout, etc.) — wrap and throw
      throw this.wrapError(error);
    }
  }

  /**
   * Checks whether an error came from a 401 HTTP response.
   * Axios throws an error object with a `.response.status` field for HTTP errors.
   */
  private isUnauthorized(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      (error as { response?: { status?: number } }).response?.status === 401
    );
  }

  /**
   * Converts any error (Axios error, unknown, etc.) into a TrustIdException.
   * This gives every caller a consistent error type to catch, regardless of what
   * actually went wrong under the hood.
   */
  private wrapError(error: unknown): TrustIdException {
    // Already wrapped — don't double-wrap
    if (error instanceof TrustIdException) return error;

    const axiosError = error as {
      response?: { data?: unknown; status?: number };
      message?: string;
    };

    // Prefer the response body from TrustID as the error message; fall back to the JS error message
    const message = axiosError?.response?.data
      ? JSON.stringify(axiosError.response.data)
      : (axiosError?.message ?? 'Unknown TrustID error');

    const statusCode = axiosError?.response?.status ?? 502;

    this.logger.error(`TrustID API error [${statusCode}]: ${message}`);

    // Pass the original error as the third arg so it can be inspected in logs
    return new TrustIdException(message, statusCode, error);
  }
}
