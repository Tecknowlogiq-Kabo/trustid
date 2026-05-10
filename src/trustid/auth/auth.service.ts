import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { SessionExpiredException } from '../common/exceptions/session-expired.exception';
import type { SessionState } from '../common/interfaces/session.interface';
import type { TrustIdConfig } from '../config/trustid.config';

/**
 * Shape of the JSON body that TrustID's /session/login/ endpoint returns.
 * We only care about Success and SessionId for our purposes.
 */
interface LoginResponse {
  Success: boolean;
  SessionId: string;
  Message?: string;
}

/**
 * TrustIdAuthService — manages the TrustID login session for the whole app.
 *
 * WHY THIS EXISTS:
 * TrustID's API requires you to log in first and get a "SessionId" token.
 * Every subsequent API call must include that token. Sessions eventually expire,
 * so we need to refresh them automatically — without every other service having
 * to worry about that complexity.
 *
 * HOW IT WORKS (high level):
 * 1. When the app starts (onModuleInit), we immediately log in and store the SessionId.
 * 2. We set a timer to re-login *before* the session expires (proactive refresh).
 * 3. Any service that needs the token just calls getSessionId() — it's always fresh.
 * 4. When the app shuts down (onModuleDestroy), we politely log out.
 *
 * IMPORTANT — circular dependency prevention:
 * This service uses the raw HttpService directly (from @nestjs/axios), NOT
 * TrustIdHttpService. That's intentional. TrustIdHttpService depends on THIS
 * service to get the session token, so if we used TrustIdHttpService here it
 * would be A → B → A (circular), which NestJS cannot resolve.
 *
 * @implements OnModuleInit  - NestJS calls onModuleInit automatically at startup
 * @implements OnModuleDestroy - NestJS calls onModuleDestroy automatically on shutdown
 */
@Injectable()
export class TrustIdAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrustIdAuthService.name);

  /**
   * Holds the current active session: the token + when it was obtained + when it expires.
   * Null means we haven't logged in yet (or we've logged out).
   */
  private sessionState: SessionState | null = null;

  /**
   * A reference to the setTimeout timer so we can cancel it if needed
   * (e.g., during a forced refresh or app shutdown).
   */
  private refreshTimer: NodeJS.Timeout | null = null;

  /**
   * A "lock" to prevent multiple simultaneous logins.
   *
   * PROBLEM this solves: Imagine 50 API requests arrive at the same time, and the
   * session has just expired. Without a lock, all 50 would try to call /session/login/
   * at the same time — that's wasteful and could get us rate-limited.
   *
   * HOW IT WORKS: When a refresh starts, we store the Promise here. Any other caller
   * that also wants a refresh just awaits the same Promise instead of starting a new one.
   * Once the refresh finishes, we set this back to null.
   */
  private refreshLock: Promise<void> | null = null;

  constructor(
    // Raw HttpService — used ONLY for login/logout calls to avoid circular dependency
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Called automatically by NestJS when the module is ready.
   * We log in immediately so the session is available before any request comes in.
   */
  async onModuleInit(): Promise<void> {
    await this.login();
  }

  /**
   * Called automatically by NestJS when the app is shutting down.
   * We cancel any pending timer and log out cleanly.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    // Use .catch(() => undefined) so a logout failure doesn't crash the shutdown
    await this.logout().catch(() => undefined);
  }

  /**
   * The main method that other services call to get the current session token.
   *
   * It handles three situations automatically:
   * - A refresh is already in progress → wait for it to finish, then return the new token
   * - The session is expired → trigger a refresh, then return the new token
   * - Session is still valid → return it immediately (the fast path, 99% of calls)
   */
  async getSessionId(): Promise<string> {
    // If another caller is already doing a refresh, wait for it instead of starting another
    if (this.refreshLock) {
      await this.refreshLock;
      return this.sessionState!.sessionId;
    }

    // Safety net: if the session somehow expired without the timer firing, refresh now
    if (!this.sessionState || this.isExpired()) {
      await this.forceRefresh();
    }

    return this.sessionState!.sessionId;
  }

  /**
   * Forces an immediate session refresh (logout + re-login).
   *
   * This is called by TrustIdHttpService when it gets a 401 back from TrustID —
   * meaning the session token was rejected. We refresh and the HTTP service
   * will retry the original request with the fresh token.
   *
   * The refreshLock pattern ensures only one refresh runs at a time even if
   * forceRefresh() is called concurrently from multiple request handlers.
   */
  async forceRefresh(): Promise<void> {
    // If a refresh is already running, just wait for it instead of starting a second one
    if (this.refreshLock) {
      return this.refreshLock;
    }

    // .finally() clears the lock whether the refresh succeeded or failed
    this.refreshLock = this.doRefresh().finally(() => {
      this.refreshLock = null;
    });

    return this.refreshLock;
  }

  /**
   * The actual refresh logic: logout the old session, then login fresh.
   */
  private async doRefresh(): Promise<void> {
    this.logger.log('Refreshing TrustID session...');
    // Ignore logout errors — the old session may already be expired on TrustID's side
    await this.logout().catch(() => undefined);
    await this.login();
  }

  /**
   * Calls TrustID's /session/login/ endpoint and stores the returned SessionId.
   * Also schedules a proactive refresh timer so the session never silently expires
   * in the middle of a request.
   */
  private async login(): Promise<void> {
    const config = this.configService.get<TrustIdConfig>('trustid')!;

    // lastValueFrom converts the RxJS Observable that HttpService returns into a plain Promise
    const response = await lastValueFrom(
      this.httpService.post<LoginResponse>(`${config.baseUrl}/session/login/`, {
        DeviceId: config.deviceId,
        Username: config.username,
        Password: config.password,
      }),
    );

    if (!response.data.Success || !response.data.SessionId) {
      throw new SessionExpiredException();
    }

    const now = new Date();
    // Calculate when this session will expire based on the configured TTL
    const expiresAt = new Date(
      now.getTime() + config.sessionTtlSeconds * 1_000,
    );

    this.sessionState = {
      sessionId: response.data.SessionId,
      acquiredAt: now,
      expiresAt,
    };

    this.logger.log(
      `TrustID session acquired, expires at ${expiresAt.toISOString()}`,
    );

    // Set a timer to refresh *before* expiry (buffer avoids last-second failures)
    this.scheduleRefresh(expiresAt, config.sessionRefreshBufferSeconds);
  }

  /**
   * Calls TrustID's /session/logout/ endpoint to invalidate the current session.
   * Always clears sessionState in the finally block, even if the HTTP call fails.
   */
  private async logout(): Promise<void> {
    if (!this.sessionState) return; // Nothing to log out from

    const config = this.configService.get<TrustIdConfig>('trustid')!;

    try {
      await lastValueFrom(
        this.httpService.post(`${config.baseUrl}/session/logout/`, {
          DeviceId: config.deviceId,
          SessionId: this.sessionState.sessionId,
        }),
      );
    } catch {
      // Ignore logout errors — session may already be expired on TrustID's side
    } finally {
      // Always clear the local state so we don't try to use a dead session token
      this.sessionState = null;
    }
  }

  /**
   * Schedules a background timer to auto-refresh the session before it expires.
   *
   * Example: if session expires in 3600 seconds and buffer is 60 seconds,
   * we schedule a refresh to fire at 3540 seconds — giving us 60 seconds of headroom.
   *
   * @param expiresAt - when the current session will expire
   * @param bufferSeconds - how many seconds before expiry to trigger the refresh
   */
  private scheduleRefresh(expiresAt: Date, bufferSeconds: number): void {
    // Cancel any previously scheduled refresh (avoids double-refreshes)
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const msUntilRefresh =
      expiresAt.getTime() - Date.now() - bufferSeconds * 1_000;

    if (msUntilRefresh <= 0) {
      // Session is already close to or past expiry — refresh immediately
      void this.forceRefresh();
      return;
    }

    // `void` tells TypeScript we intentionally don't await this Promise
    this.refreshTimer = setTimeout(() => {
      void this.forceRefresh();
    }, msUntilRefresh);
  }

  /**
   * Returns true if the session token is past its expiry time.
   */
  private isExpired(): boolean {
    if (!this.sessionState) return true;
    return Date.now() >= this.sessionState.expiresAt.getTime();
  }

  /**
   * Exposes the raw session state for health-check endpoints.
   * Returns null if not logged in.
   */
  getSessionState(): SessionState | null {
    return this.sessionState;
  }
}
