import { Injectable, Logger } from '@nestjs/common';
import { ContainerStatus } from '../common/enums/container-status.enum';
import { TrustIdException } from '../common/exceptions/trustid.exception';
import {
  CreateSelfServeDto,
  SubmitVerificationDto,
} from '../common/dto/submit-verification.dto';
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
 * The containerId is the key — store it in your database so you can:
 *   1. Match incoming webhooks to the right applicant
 *   2. Retrieve results later via getResult(containerId)
 */
export interface SubmitVerificationResult {
  containerId: string;
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

/** Result of creating a self-serve session (guest link flow) */
export interface SelfServeSessionResult {
  containerId: string; // Store this to retrieve results later
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
 * 1. Agent-assisted (submitVerification):
 *    Your backend collects the images and uploads everything.
 *    Good when you already have the documents as file uploads from your frontend.
 *    Sequence: createContainer → createDocument → uploadFrontImage → [uploadBackImage]
 *              → uploadApplicantPhoto (selfie) → publishContainer
 *    After publish, TrustID processes the documents and calls your webhook when done.
 *
 * 2. Self-serve (createSelfServeSession):
 *    TrustID hosts a page where the applicant uploads their own documents.
 *    Your backend just creates the container and gets a link to send to the applicant.
 *    Good when you want TrustID to handle the camera/upload UI.
 *    Sequence: createContainer → createGuestLink → return the link URL
 *    TrustID calls your webhook when the applicant submits.
 */
@Injectable()
export class OrchestrationService {
  private readonly logger = new Logger(OrchestrationService.name);

  constructor(
    private readonly containerService: ContainerService, // manages the "case" wrapper
    private readonly documentService: DocumentService, // manages ID document upload
    private readonly faceService: FaceService, // manages selfie/liveness upload
    private readonly guestLinkService: GuestLinkService, // creates self-serve links
    private readonly resultsService: ResultsService, // fetches and parses results
  ) {}

  /**
   * FLOW 1: Agent-assisted verification.
   *
   * Your backend uploads everything. Call this when you have all three files ready
   * (front image, optionally back image, and selfie).
   *
   * After this returns, TrustID processes the submission asynchronously (usually
   * within an hour in production). Store the containerId and listen for the
   * ResultNotification webhook to know when it's done.
   *
   * @param dto.reference - Your own ID for this applicant (e.g. a user ID from your DB).
   *                         Optional but highly recommended — it makes it much easier to
   *                         link the webhook callback back to the right user.
   * @param dto.documentType - What kind of ID: Passport, DrivingLicence, NationalId, etc.
   * @param dto.frontImageBuffer - Raw bytes of the front of the ID document
   * @param dto.backImageBuffer - Raw bytes of the back (required for two-sided documents)
   * @param dto.selfieBuffer - Raw bytes of the applicant's selfie photo
   * @returns containerId to store, and publishedAt timestamp
   */
  async submitVerification(
    dto: SubmitVerificationWithFilesDto,
  ): Promise<SubmitVerificationResult> {
    this.logger.log(
      `Starting verification submission (reference: ${dto.reference ?? 'none'})`,
    );

    // Step 1: Create the "container" — the top-level case wrapper in TrustID's system
    const containerResponse = await this.containerService.createContainer({
      reference: dto.reference,
      callbackUrl: dto.callbackUrl,
    });
    const containerId = containerResponse.ContainerId;
    this.logger.log(`Container created: ${containerId}`);

    // Step 2: Register a document inside the container (tells TrustID what type of ID to expect)
    const documentResponse = await this.documentService.createDocument({
      containerId,
      documentType: dto.documentType,
    });
    const documentId = documentResponse.DocumentId;
    this.logger.log(`Document created: ${documentId}`);

    // Step 3: Upload the front image of the ID as raw binary data
    await this.documentService.uploadFrontImage(
      containerId,
      documentId,
      dto.frontImageBuffer,
    );
    this.logger.log('Front image uploaded');

    // Step 4: Upload the back image if provided (not all documents have a back side)
    if (dto.backImageBuffer) {
      await this.documentService.uploadBackImage(
        containerId,
        documentId,
        dto.backImageBuffer,
      );
      this.logger.log('Back image uploaded');
    }

    // Step 5: Upload the selfie — TrustID will compare it to the face on the ID
    await this.faceService.uploadApplicantPhoto(containerId, dto.selfieBuffer);
    this.logger.log('Selfie uploaded');

    // Step 6: Publish — tells TrustID "we're done uploading, please process this now"
    // After this call, the container status moves from Temp → Pending
    await this.containerService.publishContainer(containerId);
    this.logger.log(`Container ${containerId} published — awaiting processing`);

    // Store containerId in your DB! You'll need it to match the incoming webhook.
    return { containerId, publishedAt: new Date() };
  }

  /**
   * FLOW 2: Self-serve verification (guest link).
   *
   * Creates a container and a one-time URL for the applicant to upload their own
   * documents through TrustID's hosted page. Your backend doesn't handle any images.
   *
   * Use case: when you want to send a link via email/SMS and let the applicant
   * do everything themselves on their phone or desktop.
   *
   * @param dto.reference - Your internal reference for this applicant (optional but recommended)
   * @param dto.redirectUrl - Where to send the applicant after they finish uploading
   * @param dto.expiryMinutes - How long the link stays valid (TrustID default applies if omitted)
   * @returns containerId to store, the guestLinkUrl to send, and when the link expires
   */
  async createSelfServeSession(
    dto: CreateSelfServeDto,
  ): Promise<SelfServeSessionResult> {
    this.logger.log(
      `Creating self-serve session (reference: ${dto.reference ?? 'none'})`,
    );

    // Create the container first — the guest link will be attached to it
    const containerResponse = await this.containerService.createContainer({
      reference: dto.reference,
    });
    const containerId = containerResponse.ContainerId;

    // Generate the one-time guest link URL that the applicant will visit
    const guestLink: GuestLinkResponse =
      await this.guestLinkService.createGuestLink({
        containerId,
        redirectUrl: dto.redirectUrl,
        expiryMinutes: dto.expiryMinutes,
      });

    this.logger.log(`Self-serve session created: ${containerId}`);

    return {
      containerId, // save this — it's how you'll identify this applicant's submission
      guestLinkUrl: guestLink.Url, // send this URL to the applicant (email, SMS, etc.)
      expiresAt: guestLink.ExpiresAt, // ISO 8601 — warn the applicant if they haven't clicked by then
    };
  }

  /**
   * Fetches and returns the parsed verification result for a given container.
   * Use this after receiving a ResultNotification webhook.
   */
  async getResult(containerId: string): Promise<VerificationSummary> {
    return this.resultsService.getVerificationResult(containerId);
  }

  /**
   * Polls TrustID repeatedly until the verification is complete (status = Archive).
   *
   * ⚠️  PREFER WEBHOOKS IN PRODUCTION — polling is slower and less efficient.
   * Use this method in:
   *   - Automated tests (no webhook server available in test environment)
   *   - One-off scripts where you need a synchronous result
   *   - Sandbox/development environments where webhooks aren't set up yet
   *
   * The method checks every `intervalMs` milliseconds and gives up after `timeoutMs`.
   * It throws a TrustIdException with status 504 if the timeout is reached.
   *
   * @param containerId - The container to poll
   * @param options.intervalMs - Check every N ms (default: 5000 — don't go too fast or you'll get rate-limited)
   * @param options.timeoutMs - Give up after N ms (default: 120000 = 2 minutes)
   */
  async pollForResult(
    containerId: string,
    options: PollOptions = {},
  ): Promise<VerificationSummary> {
    const intervalMs = options.intervalMs ?? 5_000;
    const timeoutMs = options.timeoutMs ?? 120_000;

    // Calculate the absolute time after which we stop trying
    const deadline = Date.now() + timeoutMs;

    this.logger.log(
      `Polling for result on container ${containerId} (timeout: ${timeoutMs}ms)`,
    );

    while (Date.now() < deadline) {
      const summary =
        await this.resultsService.getVerificationResult(containerId);

      // Archive status means TrustID has finished processing — we're done!
      if (summary.status === ContainerStatus.Archive) {
        this.logger.log(`Container ${containerId} archived — result ready`);
        return summary;
      }

      // Not done yet — wait before checking again to avoid hammering the API
      // Note: new Promise + setTimeout is the standard way to "sleep" in async JS
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    // We've passed the deadline without getting a completed result
    throw new TrustIdException(
      `Polling timed out after ${timeoutMs}ms for container ${containerId}`,
      504, // 504 = Gateway Timeout — the upstream service took too long
    );
  }
}
