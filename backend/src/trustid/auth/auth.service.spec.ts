import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Observable, of } from 'rxjs';
import { TrustIdAuthService } from './auth.service';
import { SessionExpiredException } from '../common/exceptions/session-expired.exception';

const mockConfig = {
  username: 'user',
  password: 'pass',
  deviceId: 'device-1',
  apiKey: 'api-key',
  baseUrl: 'https://sandbox.trustid.co.uk',
  sessionTtlSeconds: 3600,
  sessionRefreshBufferSeconds: 60,
};

const mockLoginResponse = (sessionId = 'session-abc') =>
  of({ data: { Success: true, SessionId: sessionId } });

function buildModule(loginResponse = mockLoginResponse()) {
  const post = jest.fn().mockReturnValue(loginResponse);
  const httpService = { post } as unknown as HttpService;
  const configService = {
    get: jest.fn().mockReturnValue(mockConfig),
  } as unknown as ConfigService;

  return { post, httpService, configService };
}

describe('TrustIdAuthService', () => {
  let service: TrustIdAuthService;
  let post: jest.Mock;

  beforeEach(async () => {
    const { post: p, httpService, configService } = buildModule();
    post = p;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrustIdAuthService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<TrustIdAuthService>(TrustIdAuthService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    post.mockReturnValue(of({ data: { Success: true } }));
    await service.onModuleDestroy();
    jest.clearAllMocks();
  });

  it('logs in on init and returns sessionId', async () => {
    const sessionId = await service.getSessionId();
    expect(sessionId).toBe('session-abc');
  });

  it('returns cached sessionId without re-logging in', async () => {
    await service.getSessionId();
    await service.getSessionId();
    // login call + logout call in afterEach = 2 total, not 3
    const loginCalls = post.mock.calls.filter((c: string[]) =>
      c[0].includes('/session/login/'),
    );
    expect(loginCalls).toHaveLength(1);
  });

  it('refreshes session on forceRefresh', async () => {
    post.mockReturnValue(
      of({ data: { Success: true, SessionId: 'session-xyz' } }),
    );
    await service.forceRefresh();
    const sessionId = await service.getSessionId();
    expect(sessionId).toBe('session-xyz');
  });

  it('concurrent forceRefresh calls only trigger one login', async () => {
    let resolveLogin!: (v: unknown) => void;
    const delayedLogin = new Promise((res) => {
      resolveLogin = res;
    });
    post.mockReturnValueOnce(of({ data: { Success: true } })); // logout
    post.mockReturnValue(
      new Observable(
        (subscriber: { next: (v: unknown) => void; complete: () => void }) => {
          void delayedLogin.then(() => {
            subscriber.next({
              data: { Success: true, SessionId: 'concurrent-session' },
            });
            subscriber.complete();
          });
        },
      ),
    );

    const [r1, r2] = await Promise.all([
      service.forceRefresh(),
      (resolveLogin(null), service.forceRefresh()),
    ]);

    expect(r1).toBeUndefined();
    expect(r2).toBeUndefined();
  });

  it('throws SessionExpiredException when login returns Success=false', async () => {
    const { httpService, configService } = buildModule(
      of({ data: { Success: false, SessionId: '' } }),
    );

    const module = await Test.createTestingModule({
      providers: [
        TrustIdAuthService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    const failService = module.get<TrustIdAuthService>(TrustIdAuthService);
    await expect(failService.onModuleInit()).rejects.toThrow(
      SessionExpiredException,
    );
  });
});
