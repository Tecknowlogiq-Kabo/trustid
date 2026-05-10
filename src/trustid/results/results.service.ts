import { Injectable } from '@nestjs/common';
import { ContainerStatus } from '../common/enums/container-status.enum';
import { KycOutcome } from '../common/enums/kyc-outcome.enum';
import type {
  DocumentField,
  KycValidation,
  RetrieveContainerResponse,
  VerificationSummary,
} from '../common/interfaces/container.interface';
import { ContainerService } from '../container/container.service';

/**
 * ResultsService — fetches and parses verification results from TrustID.
 *
 * TrustID's raw API returns a deeply nested Container object with lots of fields.
 * This service converts that raw response into a clean VerificationSummary that's
 * easy to work with — a flat object with the fields you actually care about.
 *
 * TYPICAL USAGE:
 *   1. Receive a ResultNotification webhook (container is done processing)
 *   2. Call getVerificationResult(containerId) to get the parsed summary
 *   3. Check summary.overallOutcome to decide what to do next
 */
@Injectable()
export class ResultsService {
  constructor(private readonly containerService: ContainerService) {}

  /**
   * Fetches the full container from TrustID and returns a parsed VerificationSummary.
   *
   * The VerificationSummary gives you:
   *   - overallOutcome: 'Passed' | 'NeedsReview' | 'Failed' | 'Pending'
   *   - isLive: did the selfie pass liveness detection?
   *   - livenessConfidence: 0-100 confidence score from TrustID's AI
   *   - kycValidations: array of individual KYC/AML check results
   *   - documentFields: all extracted data from the ID (name, DOB, passport number, etc.)
   */
  async getVerificationResult(
    containerId: string,
  ): Promise<VerificationSummary> {
    const raw = await this.containerService.retrieveContainer(containerId);
    return this.parseContainer(raw);
  }

  /**
   * Quick yes/no check: has this applicant fully passed verification?
   * Returns true only if BOTH conditions are met:
   *   1. All KYC/AML checks passed
   *   2. The selfie passed liveness detection (it's a real person, not a printed photo)
   */
  async isVerified(containerId: string): Promise<boolean> {
    const summary = await this.getVerificationResult(containerId);
    return summary.overallOutcome === KycOutcome.Passed && summary.isLive;
  }

  /**
   * Returns just the KYC/AML validation results.
   * Each item has a Name (e.g. "PEP Check"), DisplayName, and Outcome (Passed/NeedsReview/Failed).
   */
  async getKycOutcomes(containerId: string): Promise<KycValidation[]> {
    const summary = await this.getVerificationResult(containerId);
    return summary.kycValidations;
  }

  /**
   * Returns all data fields extracted from the identity document.
   * Includes fields like: GivenNames, FamilyName, DateOfBirth, DocumentNumber, ExpiryDate, etc.
   * Each field has a Source score (1-5) indicating how reliably it was read.
   */
  async getDocumentFields(containerId: string): Promise<DocumentField[]> {
    const summary = await this.getVerificationResult(containerId);
    return summary.documentFields;
  }

  /**
   * Converts the raw TrustID Container object into our clean VerificationSummary.
   *
   * OVERALL OUTCOME LOGIC:
   *   - Container not yet in Archive status → 'Pending' (still processing)
   *   - Any KYC validation Failed → 'Failed' (hard failure, can't override)
   *   - All KYC validations Passed AND liveness passed → 'Passed'
   *   - All KYC validations Passed BUT liveness failed → 'NeedsReview'
   *   - Some KYC validations NeedsReview (no failures) → 'NeedsReview'
   *   - No KYC validations at all (not enabled) AND liveness passed → 'Passed'
   *   - No KYC validations at all AND liveness failed → 'NeedsReview'
   *
   * The optional chaining (?.) and nullish coalescing (??) handle cases where
   * TrustID didn't include certain sections (e.g. no face photo was uploaded).
   */
  private parseContainer(raw: RetrieveContainerResponse): VerificationSummary {
    const container = raw.Container;

    // Extract liveness data — these fields are absent if no selfie was uploaded
    const isLive =
      container.ApplicantPhoto?.LivenessTestResults?.IsLive ?? false;
    const livenessConfidence =
      container.ApplicantPhoto?.LivenessTestResults?.Confidence ?? 0;

    // KYC validations — empty array if KYC/AML add-on is not enabled for this account
    const kycValidations = container.KycAmlValidation?.Validations ?? [];

    // Flatten all document fields from all documents into a single array for convenience
    const documentFields =
      container.Documents?.flatMap((d) => d.DocumentFields) ?? [];

    // --- Determine overall outcome ---
    let overallOutcome: KycOutcome | 'Pending';

    if (container.Status !== ContainerStatus.Archive) {
      // Still processing — don't try to determine pass/fail yet
      overallOutcome = 'Pending';
    } else if (kycValidations.some((v) => v.Outcome === KycOutcome.Failed)) {
      // Any hard failure overrides everything else
      overallOutcome = KycOutcome.Failed;
    } else if (kycValidations.every((v) => v.Outcome === KycOutcome.Passed)) {
      // All KYC checks passed — liveness becomes the deciding factor
      overallOutcome = isLive ? KycOutcome.Passed : KycOutcome.NeedsReview;
    } else if (kycValidations.length === 0) {
      // KYC not enabled — fall back to liveness only
      overallOutcome = isLive ? KycOutcome.Passed : KycOutcome.NeedsReview;
    } else {
      // Mix of Passed and NeedsReview — flag for human review
      overallOutcome = KycOutcome.NeedsReview;
    }

    return {
      containerId: container.Id,
      status: container.Status,
      overallOutcome,
      isLive,
      livenessConfidence,
      kycValidations,
      documentFields,
      retrievedAt: new Date(),
    };
  }
}
