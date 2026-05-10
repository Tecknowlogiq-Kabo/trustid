import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { ResultsService } from '../results/results.service';
import { WebhookPayloadDto } from '../common/dto/webhook-payload.dto';
import { KycOutcome } from '../common/enums/kyc-outcome.enum';
import { ContainerStatus } from '../common/enums/container-status.enum';

function makePayload(
  workflowName: string,
  workflowState = 'Stop',
): WebhookPayloadDto {
  return {
    Callback: {
      CallbackId: `cb-${Math.random()}`,
      WorkflowName: workflowName,
      WorkflowState: workflowState,
      CallbackAt: new Date().toISOString(),
      CallbackUrl: 'https://example.com/webhook',
      RetryCounter: 0,
      WorkflowStorage: { ContainerId: 'container-abc' },
    },
    Response: {
      Success: true,
      Message: 'OK',
      ContainerId: 'container-abc',
    },
  };
}

const mockSummary = {
  containerId: 'container-abc',
  status: ContainerStatus.Archive,
  overallOutcome: KycOutcome.Passed,
  isLive: true,
  livenessConfidence: 95,
  kycValidations: [],
  documentFields: [],
  retrievedAt: new Date(),
};

describe('WebhookService', () => {
  let service: WebhookService;
  let resultsService: jest.Mocked<ResultsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        {
          provide: ResultsService,
          useValue: {
            getVerificationResult: jest.fn().mockResolvedValue(mockSummary),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    resultsService = module.get(ResultsService);
  });

  it('routes AutoReferral/Stop to ResultNotification and fetches result', async () => {
    const payload = makePayload('AutoReferral', 'Stop');
    await service.dispatch(payload);
    expect(resultsService.getVerificationResult).toHaveBeenCalledWith(
      'container-abc',
    );
  });

  it('skips duplicate callbackIds', async () => {
    const payload = makePayload('AutoReferral', 'Stop');
    payload.Callback.CallbackId = 'fixed-id';

    await service.dispatch(payload);
    await service.dispatch(payload);

    expect(resultsService.getVerificationResult).toHaveBeenCalledTimes(1);
  });

  it('routes ContainerSubmitted without calling resultsService', async () => {
    const payload = makePayload('ContainerSubmitted');
    await service.dispatch(payload);
    expect(resultsService.getVerificationResult).not.toHaveBeenCalled();
  });

  it('routes SentToReview without calling resultsService', async () => {
    const payload = makePayload('SentToReview');
    await service.dispatch(payload);
    expect(resultsService.getVerificationResult).not.toHaveBeenCalled();
  });

  it('routes UpdateDocument without calling resultsService', async () => {
    const payload = makePayload('UpdateDocument');
    await service.dispatch(payload);
    expect(resultsService.getVerificationResult).not.toHaveBeenCalled();
  });

  it('routes UpdateDocumentContainer without calling resultsService', async () => {
    const payload = makePayload('UpdateDocumentContainer');
    await service.dispatch(payload);
    expect(resultsService.getVerificationResult).not.toHaveBeenCalled();
  });
});
