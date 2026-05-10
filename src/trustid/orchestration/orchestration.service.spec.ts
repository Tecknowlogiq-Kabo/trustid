import { Test, TestingModule } from '@nestjs/testing';
import { OrchestrationService } from './orchestration.service';
import { ContainerService } from '../container/container.service';
import { DocumentService } from '../document/document.service';
import { FaceService } from '../face/face.service';
import { GuestLinkService } from '../guest-link/guest-link.service';
import { ResultsService } from '../results/results.service';
import { DocumentType } from '../common/enums/document-type.enum';
import { ContainerStatus } from '../common/enums/container-status.enum';
import { KycOutcome } from '../common/enums/kyc-outcome.enum';
import { TrustIdException } from '../common/exceptions/trustid.exception';

const mockSummary = (status = ContainerStatus.Archive) => ({
  containerId: 'c-123',
  status,
  overallOutcome: KycOutcome.Passed,
  isLive: true,
  livenessConfidence: 99,
  kycValidations: [],
  documentFields: [],
  retrievedAt: new Date(),
});

describe('OrchestrationService', () => {
  let service: OrchestrationService;
  let containerService: jest.Mocked<ContainerService>;
  let documentService: jest.Mocked<DocumentService>;
  let faceService: jest.Mocked<FaceService>;
  // guestLinkService used via DI in module — not directly asserted in these tests
  let _guestLinkService: jest.Mocked<GuestLinkService>;
  let resultsService: jest.Mocked<ResultsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestrationService,
        {
          provide: ContainerService,
          useValue: {
            createContainer: jest
              .fn()
              .mockResolvedValue({ Success: true, ContainerId: 'c-123' }),
            publishContainer: jest.fn().mockResolvedValue({ Success: true }),
          },
        },
        {
          provide: DocumentService,
          useValue: {
            createDocument: jest.fn().mockResolvedValue({
              Success: true,
              DocumentId: 'd-456',
              ContainerId: 'c-123',
            }),
            uploadFrontImage: jest.fn().mockResolvedValue({ Success: true }),
            uploadBackImage: jest.fn().mockResolvedValue({ Success: true }),
          },
        },
        {
          provide: FaceService,
          useValue: {
            uploadApplicantPhoto: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: GuestLinkService,
          useValue: {
            createGuestLink: jest.fn().mockResolvedValue({
              Success: true,
              Url: 'https://link.trustid.co.uk/abc',
              ExpiresAt: '2026-05-11T00:00:00Z',
              ContainerId: 'c-123',
            }),
          },
        },
        {
          provide: ResultsService,
          useValue: {
            getVerificationResult: jest.fn().mockResolvedValue(mockSummary()),
          },
        },
      ],
    }).compile();

    service = module.get<OrchestrationService>(OrchestrationService);
    containerService = module.get(ContainerService);
    documentService = module.get(DocumentService);
    faceService = module.get(FaceService);
    _guestLinkService = module.get(GuestLinkService);
    resultsService = module.get(ResultsService);
  });

  describe('submitVerification', () => {
    const dto = {
      documentType: DocumentType.Passport,
      frontImageBuffer: Buffer.from('front'),
      selfieBuffer: Buffer.from('selfie'),
    };

    it('calls services in correct sequence', async () => {
      const order: string[] = [];

      containerService.createContainer.mockImplementation(() => {
        order.push('createContainer');
        return Promise.resolve({
          Success: true,
          ContainerId: 'c-123',
          Message: '',
        });
      });
      documentService.createDocument.mockImplementation(() => {
        order.push('createDocument');
        return Promise.resolve({
          Success: true,
          DocumentId: 'd-456',
          ContainerId: 'c-123',
          Message: '',
        });
      });
      documentService.uploadFrontImage.mockImplementation(() => {
        order.push('uploadFrontImage');
        return Promise.resolve({
          Success: true,
          ImageId: 'img-1',
          Message: '',
        });
      });
      faceService.uploadApplicantPhoto.mockImplementation(() => {
        order.push('uploadApplicantPhoto');
        return Promise.resolve();
      });
      containerService.publishContainer.mockImplementation(() => {
        order.push('publishContainer');
        return Promise.resolve({
          Success: true,
          ContainerId: 'c-123',
          Message: '',
        });
      });

      await service.submitVerification(dto);

      expect(order).toEqual([
        'createContainer',
        'createDocument',
        'uploadFrontImage',
        'uploadApplicantPhoto',
        'publishContainer',
      ]);
    });

    it('uploads back image when provided', async () => {
      await service.submitVerification({
        ...dto,
        backImageBuffer: Buffer.from('back'),
      });
      expect(documentService.uploadBackImage).toHaveBeenCalledWith(
        'c-123',
        'd-456',
        Buffer.from('back'),
      );
    });

    it('skips back image upload when not provided', async () => {
      await service.submitVerification(dto);
      expect(documentService.uploadBackImage).not.toHaveBeenCalled();
    });

    it('returns containerId and publishedAt', async () => {
      const result = await service.submitVerification(dto);
      expect(result.containerId).toBe('c-123');
      expect(result.publishedAt).toBeInstanceOf(Date);
    });
  });

  describe('createSelfServeSession', () => {
    it('creates container and guest link, returns correct shape', async () => {
      const result = await service.createSelfServeSession({
        reference: 'ref-1',
      });
      expect(result.containerId).toBe('c-123');
      expect(result.guestLinkUrl).toBe('https://link.trustid.co.uk/abc');
      expect(result.expiresAt).toBe('2026-05-11T00:00:00Z');
    });
  });

  describe('pollForResult', () => {
    it('returns immediately when container is archived', async () => {
      const result = await service.pollForResult('c-123', { intervalMs: 10 });
      expect(result.status).toBe(ContainerStatus.Archive);
    });

    it('polls until archived', async () => {
      resultsService.getVerificationResult
        .mockResolvedValueOnce(mockSummary(ContainerStatus.Pending))
        .mockResolvedValueOnce(mockSummary(ContainerStatus.Pending))
        .mockResolvedValueOnce(mockSummary(ContainerStatus.Archive));

      const result = await service.pollForResult('c-123', { intervalMs: 10 });
      expect(result.status).toBe(ContainerStatus.Archive);
      expect(resultsService.getVerificationResult).toHaveBeenCalledTimes(3);
    });

    it('throws TrustIdException on timeout', async () => {
      resultsService.getVerificationResult.mockResolvedValue(
        mockSummary(ContainerStatus.Pending),
      );

      await expect(
        service.pollForResult('c-123', { intervalMs: 10, timeoutMs: 50 }),
      ).rejects.toThrow(TrustIdException);
    });
  });
});
