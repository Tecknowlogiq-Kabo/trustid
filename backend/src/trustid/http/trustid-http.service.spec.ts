import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { TrustIdHttpService } from './trustid-http.service';
import { TrustIdAuthService } from '../auth/auth.service';
import { TrustIdException } from '../common/exceptions/trustid.exception';

const mockConfig = {
  deviceId: 'device-1',
  apiKey: 'key-123',
  baseUrl: 'https://sandbox.trustid.co.uk',
};

function setup(postImpl?: jest.Mock) {
  const post =
    postImpl ?? jest.fn().mockReturnValue(of({ data: { Success: true } }));
  const get = jest.fn().mockReturnValue(of({ data: [] }));
  const httpService = { post, get } as unknown as HttpService;
  const authService = {
    getSessionId: jest.fn().mockResolvedValue('session-abc'),
    forceRefresh: jest.fn().mockResolvedValue(undefined),
  } as unknown as TrustIdAuthService;
  const configService = {
    get: jest.fn().mockReturnValue(mockConfig),
  } as unknown as ConfigService;

  return { post, get, httpService, authService, configService };
}

describe('TrustIdHttpService', () => {
  let service: TrustIdHttpService;
  let post: jest.Mock;
  let authService: TrustIdAuthService;

  beforeEach(async () => {
    const deps = setup();
    post = deps.post;
    authService = deps.authService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrustIdHttpService,
        { provide: HttpService, useValue: deps.httpService },
        { provide: TrustIdAuthService, useValue: deps.authService },
        { provide: ConfigService, useValue: deps.configService },
      ],
    }).compile();

    service = module.get<TrustIdHttpService>(TrustIdHttpService);
  });

  it('injects DeviceId, SessionId, and Tid-Api-Key headers on POST', async () => {
    await service.post('/some/path/', { foo: 'bar' });

    const config = post.mock.calls[0][2] as { headers: Record<string, string> };
    expect(config.headers['__TT_DeviceId']).toBe('device-1');
    expect(config.headers['__TT_SessionId']).toBe('session-abc');
    expect(config.headers['Tid-Api-Key']).toBe('key-123');
  });

  it('builds the correct URL from baseUrl + path', async () => {
    await service.post('/dataAccess/createDocumentContainer/', {});
    const [url] = post.mock.calls[0];
    expect(url).toBe(
      'https://sandbox.trustid.co.uk/dataAccess/createDocumentContainer/',
    );
  });

  it('returns response.data', async () => {
    post.mockReturnValue(of({ data: { ContainerId: 'c-123' } }));
    const result = await service.post<{ ContainerId: string }>('/path/', {});
    expect(result.ContainerId).toBe('c-123');
  });

  it('calls forceRefresh and retries once on 401', async () => {
    const unauthorizedError = {
      response: { status: 401, data: 'Unauthorized' },
    };
    post
      .mockReturnValueOnce(throwError(() => unauthorizedError))
      .mockReturnValueOnce(of({ data: { Success: true } }));

    await service.post('/path/', {});

    expect(authService.forceRefresh).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('throws TrustIdException on non-401 errors', async () => {
    post.mockReturnValue(
      throwError(() => ({ response: { status: 500, data: 'Server Error' } })),
    );
    await expect(service.post('/path/', {})).rejects.toThrow(TrustIdException);
  });

  it('throws TrustIdException on 401 if retry also fails', async () => {
    const unauthorizedError = {
      response: { status: 401, data: 'Unauthorized' },
    };
    post.mockReturnValue(throwError(() => unauthorizedError));
    await expect(service.post('/path/', {})).rejects.toThrow(TrustIdException);
  });

  it('sets application/octet-stream for binary uploads', async () => {
    post.mockReturnValue(of({ data: { Success: true, ImageId: 'img-1' } }));
    await service.postBinary('/dataAccess/uploadImage/', Buffer.from('test'), {
      __TT_ContainerId: 'c-1',
    });

    const binaryConfig = post.mock.calls[0][2] as {
      headers: Record<string, string>;
    };
    expect(binaryConfig.headers['Content-Type']).toBe(
      'application/octet-stream',
    );
  });
});
