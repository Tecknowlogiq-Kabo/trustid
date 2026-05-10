import { ContainerStatus } from '../enums/container-status.enum';
import { DocumentType } from '../enums/document-type.enum';
import { KycOutcome } from '../enums/kyc-outcome.enum';

export interface TrustIdApiResponse {
  Success: boolean;
  Message: string;
}

export interface CreateContainerResponse extends TrustIdApiResponse {
  ContainerId: string;
}

export interface CreateDocumentResponse extends TrustIdApiResponse {
  ContainerId: string;
  DocumentId: string;
}

export interface UploadImageResponse extends TrustIdApiResponse {
  ImageId: string;
}

export interface PublishContainerResponse extends TrustIdApiResponse {
  ContainerId: string;
}

export interface GuestLinkResponse extends TrustIdApiResponse {
  Url: string;
  ExpiresAt: string;
  ContainerId: string;
}

export interface DocumentField {
  FieldName: string;
  FieldValue: string;
  Source: number;
}

export interface FeedbackProperties {
  IsValidMrz?: boolean;
  IsValidHrz?: boolean;
  MissingFields?: string[];
  OperatorAssessmentSummary?: string;
}

export interface TrustIdDocument {
  Id: string;
  DocumentType: DocumentType;
  DocumentName: string;
  IssuingCountry?: {
    DisplayName: string;
    MrzCode: string;
    IsEuMember: boolean;
    IsUkMember: boolean;
  };
  DocumentFields: DocumentField[];
  FeedbackProperties: FeedbackProperties;
  CustomFields?: Record<string, unknown>;
}

export interface LivenessTestResults {
  IsLive: boolean;
  Confidence: number;
}

export interface KycValidation {
  Name: string;
  DisplayName: string;
  DetailedResult: string;
  Outcome: KycOutcome;
}

export interface ContainerResult {
  Id: string;
  Status: ContainerStatus;
  CreatedDate: string;
  Documents: TrustIdDocument[];
  ApplicantPhoto?: {
    ImageId: string;
    LivenessTestResults: LivenessTestResults;
  };
  KycAmlValidation?: {
    Validations: KycValidation[];
  };
  CustomFields?: Record<string, unknown>;
}

export interface RetrieveContainerResponse extends TrustIdApiResponse {
  Container: ContainerResult;
}

export interface VerificationSummary {
  containerId: string;
  status: ContainerStatus;
  overallOutcome: KycOutcome | 'Pending';
  isLive: boolean;
  livenessConfidence: number;
  kycValidations: KycValidation[];
  documentFields: DocumentField[];
  retrievedAt: Date;
}
