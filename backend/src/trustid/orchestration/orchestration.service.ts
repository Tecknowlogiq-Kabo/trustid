import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { VerificationStatus } from '../common/enums/verification-status.enum';
import { TrustIdException } from '../common/exceptions/trustid.exception';
import {
  CreateDelegatedVerificationDto,
  SubmitVerificationDto,
} from '../common/dto/submit-verification.dto';
import { parseDocumentType } from '../common/enums/document-type.enum';
import type {
  GuestLinkResponse,
  VerificationSummary,
} from '../common/interfaces/container.interface';
import { ContainerService } from '../container/container.service';
import { DocumentService } from '../document/document.service';
import { FaceService } from '../face/face.service';
import { GuestLinkService } from '../guest-link/guest-link.service';
import { ResultsService } from '../results/results.service';

/**
 * The result returned after successfully submitting a verification.
 * Store verificationId — you'll need it to match incoming webhooks and retrieve results.
 */
export interface SubmitVerificationResult {
  verificationId: string;
  publishedAt: Date;
}

/**
 * Extends the basic SubmitVerificationDto with the actual image Buffers.
 * The HTTP controller reads the uploaded files and adds them here before
 * passing the combined object to submitVerification().
 */
export interface SubmitVerificationWithFilesDto extends SubmitVerificationDto {
  frontImageBuffer: Buffer; // Required: photo of the front of the ID document
  backImageBuffer?: Buffer; // Optional: photo of the back (needed for EU ID cards, BRP, etc.)
  selfieBuffer: Buffer; // Required: photo of the applicant's face (for liveness check)
}

/** Result of creating a Delegated Verification session (guest link escape hatch) */
export interface DelegatedVerificationResult {
  verificationId: string; // Store this to retrieve results later
  guestLinkUrl: string; // Send this URL to the applicant — they upload their own docs
  expiresAt: string; // ISO 8601 timestamp — the link stops working after this time
}

/** Options for the polling helper method */
export interface PollOptions {
  intervalMs?: number; // How long to wait between checks (default: 5000ms = 5 seconds)
  timeoutMs?: number; // Give up after this many ms (default: 120000ms = 2 minutes)
}

/**
 * OrchestrationService — the high-level API for identity verification.
 *
 * This is the service you'll use 90% of the time. It coordinates the lower-level
 * services (ContainerService, DocumentService, FaceService, etc.) so you don't have
 * to call them individually.
 *
 * TWO VERIFICATION FLOWS:
 *
 * 1. Verification (submitVerification):
 *    The standard flow — the app captures documents and submits them via the API.
 *    Sequence: createContainer -> createDocument -> uploadFrontImage -> [uploadBackImage]
 *              -> uploadApplicantPhoto (selfie) -> publishContainer
 *    After publish, TrustID processes the documents and calls your webhook when done.
 *
 * 2. Delegated Verification (createDelegatedVerification):
 *    Escape hatch — a guest link is issued so the applicant can complete document
 *    capture outside the app via TrustID's hosted page.
 *    Sequence: createContainer -> createGuestLink -> return the link URL
 *    TrustID calls your webhook when the applicant submits.
 */
@Injectable()
export class OrchestrationService {
  private readonly logger = new Logger(OrchestrationService.name);

  constructor(
    private readonly containerService: ContainerService, // manages the TrustID container internally
    private readonly documentService: DocumentService, // manages ID document upload
    private readonly faceService: FaceService, // manages selfie/liveness upload
    private readonly guestLinkService: GuestLinkService, // creates delegated verification links
    private readonly resultsService: ResultsService, // fetches and parses results
  ) {}

  /**
   * FLOW 1: Verification.
   *
   * Your backend uploads everything. Call this when you have all three files ready
   * (front image, optionally back image, and selfie).
   *
   * After this returns, TrustID processes the submission asynchronously (usually
   * within an hour in production). Store the verificationId and listen for the
   * ResultNotification webhook to know when it's done.
   *
   * @param dto.documentType - What kind of ID: Passport, DrivingLicence, NationalId, etc.
   * @param dto.frontImageBuffer - Raw bytes of the front of the ID document
   * @param dto.backImageBuffer - Raw bytes of the back (required for two-sided documents)
   * @param dto.selfieBuffer - Raw bytes of the applicant's selfie photo
   * @returns verificationId to store, and publishedAt timestamp
   */
  async submitVerification(
    dto: SubmitVerificationWithFilesDto,
  ): Promise<SubmitVerificationResult> {
    const applicantId = randomUUID();
    this.logger.log(
      `Starting verification submission (applicantId: ${applicantId})`,
    );

    // Step 1: Create the TrustID container — the top-level case wrapper
    const containerResponse = await this.containerService.createContainer({
      applicantId,
      callbackUrl: dto.callbackUrl,
    });
    const verificationId = containerResponse.ContainerId;
    this.logger.log(`Verification created: ${verificationId}`);

    // Step 2: Register a document inside the container (tells TrustID what type of ID to expect)
    const documentResponse = await this.documentService.createDocument({
      containerId: verificationId,
      documentType: parseDocumentType(dto.documentType),
    });
    const documentId = documentResponse.DocumentId;
    this.logger.log(`Document created: ${documentId}`);

    // Step 3: Upload the front image of the ID as raw binary data
    await this.documentService.uploadFrontImage(
      verificationId,
      documentId,
      dto.frontImageBuffer,
    );
    this.logger.log('Front image uploaded');

    // Step 4: Upload the back image if provided (not all documents have a back side)
    if (dto.backImageBuffer) {
      await this.documentService.uploadBackImage(
        verificationId,
        documentId,
        dto.backImageBuffer,
      );
      this.logger.log('Back image uploaded');
    }

    // Step 5: Upload the selfie — TrustID will compare it to the face on the ID
    await this.faceService.uploadApplicantPhoto(verificationId, dto.selfieBuffer);
    this.logger.log('Selfie uploaded');

    // Step 6: Publish — tells TrustID "we're done uploading, please process this now"
    await this.containerService.publishContainer(verificationId);
    this.logger.log(`Verification ${verificationId} submitted — awaiting processing`);

    // Store verificationId — you'll need it to match the incoming webhook.
    return { verificationId, publishedAt: new Date() };
  }

  /**
   * FLOW 2: Delegated Verification.
   *
   * Creates a one-time URL for the applicant to upload their own documents through
   * TrustID's hosted page. Use this as an escape hatch when in-app capture is not possible.
   *
   * @param dto.redirectUrl - Where to send the applicant after they finish uploading
   * @param dto.expiryMinutes - How long the link stays valid (TrustID default applies if omitted)
   * @returns verificationId to store, the guestLinkUrl to send, and when the link expires
   */
  async createDelegatedVerification(
    dto: CreateDelegatedVerificationDto,
  ): Promise<DelegatedVerificationResult> {
    const applicantId = randomUUID();
    this.logger.log(
      `Creating delegated verification (applicantId: ${applicantId})`,
    );

    // Create the TrustID container — the guest link will be attached to it
    const containerResponse = await this.containerService.createContainer({
      applicantId,
    });
    const verificationId = containerResponse.ContainerId;

    // Generate the one-time guest link URL that the applicant will visit
    const guestLink: GuestLinkResponse =
      await this.guestLinkService.createGuestLink({
        containerId: verificationId,
        redirectUrl: dto.redirectUrl,
        expiryMinutes: dto.expiryMinutes,
      });

    this.logger.log(`Delegated verification created: ${verificationId}`);

    return {
      verificationId, // save this — it's how you'll identify this applicant's submission
      guestLinkUrl: guestLink.Url, // send this URL to the applicant (email, SMS, etc.)
      expiresAt: guestLink.ExpiresAt, // ISO 8601 — warn the applicant if they haven't clicked by then
    };
  }

  /**
   * Fetches and returns the parsed verification result for a given verificationId.
   * Use this after receiving a ResultNotification webhook.
   */
  async getResult(verificationId: string): Promise<VerificationSummary> {
    return this.resultsService.getVerificationResult(verificationId);
  }

  /**
   * Polls TrustID repeatedly until the verification is Complete.
   *
   * PREFER WEBHOOKS IN PRODUCTION — polling is slower and less efficient.
   * Use this method in:
   *   - Automated tests (no webhook server available in test environment)
   *   - One-off scripts where you need a synchronous result
   *   - Sandbox/development environments where webhooks aren't set up yet
   *
   * @param verificationId - The verification to poll
   * @param options.intervalMs - Check every N ms (default: 5000 — don't go too fast or you'll get rate-limited)
   * @param options.timeoutMs - Give up after N ms (default: 120000 = 2 minutes)
   */
  async pollForResult(
    verificationId: string,
    options: PollOptions = {},
  ): Promise<VerificationSummary> {
    const intervalMs = options.intervalMs ?? 5_000;
    const timeoutMs = options.timeoutMs ?? 120_000;

    const deadline = Date.now() + timeoutMs;

    this.logger.log(
      `Polling for result on verification ${verificationId} (timeout: ${timeoutMs}ms)`,
    );

    while (Date.now() < deadline) {
      const summary =
        await this.resultsService.getVerificationResult(verificationId);

      if (summary.status === VerificationStatus.Complete) {
        this.logger.log(`Verification ${verificationId} complete — result ready`);
        return summary;
      }

      // Not done yet — wait before checking again to avoid hammering the API
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new TrustIdException(
      `Polling timed out after ${timeoutMs}ms for verification ${verificationId}`,
      504,
    );
  }
}
