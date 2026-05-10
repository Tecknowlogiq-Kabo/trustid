import { Injectable, Logger } from '@nestjs/common';
import { WebhookPayloadDto } from '../common/dto/webhook-payload.dto';
import { WebhookEvent } from '../common/enums/webhook-event.enum';
import { ResultsService } from '../results/results.service';

/**
 * WebhookService — routes incoming TrustID webhook events to the right handler.
 *
 * TrustID sends all events to a single endpoint. This service inspects the payload
 * to figure out *which* event type arrived, then delegates to the appropriate handler.
 *
 * THE 5 EVENT TYPES TrustID can send:
 *  1. ResultNotification       — scanning is DONE, results are ready to retrieve
 *  2. ContainerSubmitted       — container entered the processing queue
 *  3. ContainerSentToReview    — automated check failed, a human will review it
 *  4. DocumentModifiedPostResult — a document was changed after the initial result
 *  5. ContainerModifiedPostResult — the whole container was changed after initial result
 *
 * HOW TO IDENTIFY ResultNotification (the most important event):
 * TrustID doesn't send an explicit "eventType" field. Instead, you must check:
 *   WorkflowName === 'AutoReferral' AND WorkflowState === 'Stop'
 * This specific combination means "processing completed, go fetch the result."
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  /**
   * TrustID retries failed deliveries up to 3 times with 5-minute gaps.
   * Without deduplication, we'd process the same event 3 times if the first
   * delivery succeeded but TrustID's HTTP client timed out waiting for our 200.
   *
   * This Set stores the CallbackId of every event we've already processed.
   * If the same CallbackId arrives again, we skip it.
   *
   * NOTE: This is an in-memory Set — it resets on server restart. For production
   * with multiple server instances, store processed IDs in Redis instead.
   */
  private readonly processedCallbackIds = new Set<string>();

  constructor(private readonly resultsService: ResultsService) {}

  /**
   * Main entry point. Called by the webhook controller for every incoming event.
   *
   * @param payload - The parsed and validated body from TrustID's POST request
   */
  async dispatch(payload: WebhookPayloadDto): Promise<void> {
    const callbackId = payload.Callback.CallbackId;

    // --- Deduplication check ---
    if (this.processedCallbackIds.has(callbackId)) {
      this.logger.warn(
        `Duplicate webhook received (CallbackId: ${callbackId}) — skipping`,
      );
      return;
    }

    // Mark as seen BEFORE processing to prevent a second concurrent call from
    // slipping through before the first finishes
    this.processedCallbackIds.add(callbackId);

    const event = this.identifyEvent(payload);
    const containerId = payload.Callback.WorkflowStorage.ContainerId;

    this.logger.log(
      `Received TrustID webhook event: ${event} (ContainerId: ${containerId})`,
    );

    // Route to the correct handler based on the event type
    switch (event) {
      case WebhookEvent.ResultNotification:
        await this.handleResultNotification(payload);
        break;
      case WebhookEvent.ContainerSubmitted:
        this.handleContainerSubmitted(payload);
        break;
      case WebhookEvent.ContainerSentToReview:
        this.handleContainerSentToReview(payload);
        break;
      case WebhookEvent.DocumentModifiedPostResult:
        this.handleDocumentModifiedPostResult(payload);
        break;
      case WebhookEvent.ContainerModifiedPostResult:
        this.handleContainerModifiedPostResult(payload);
        break;
    }
  }

  /**
   * Translates the raw TrustID payload fields into our internal WebhookEvent enum.
   *
   * TrustID uses (WorkflowName + WorkflowState) to identify events instead of a
   * dedicated "eventType" field — so we have to map them ourselves.
   */
  private identifyEvent(payload: WebhookPayloadDto): WebhookEvent {
    const { WorkflowName, WorkflowState } = payload.Callback;

    // ResultNotification: BOTH fields must match — this is the most important event
    if (WorkflowName === 'AutoReferral' && WorkflowState === 'Stop') {
      return WebhookEvent.ResultNotification;
    }

    if (WorkflowName === 'ContainerSubmitted') {
      return WebhookEvent.ContainerSubmitted;
    }

    if (WorkflowName === 'SentToReview') {
      return WebhookEvent.ContainerSentToReview;
    }

    if (WorkflowName === 'UpdateDocument') {
      return WebhookEvent.DocumentModifiedPostResult;
    }

    if (WorkflowName === 'UpdateDocumentContainer') {
      return WebhookEvent.ContainerModifiedPostResult;
    }

    // Unknown workflow — log it and fall back to ResultNotification so we at least try
    this.logger.warn(
      `Unknown TrustID webhook workflow: ${WorkflowName}/${WorkflowState}`,
    );
    return WebhookEvent.ResultNotification;
  }

  /**
   * Handles the "scan is complete, go get the results" event.
   * This is the event you'll extend most — add your business logic here.
   *
   * Example extensions:
   *   - Save the VerificationSummary to your database
   *   - Send an email to the applicant ("Your ID has been verified!")
   *   - Trigger the next step in an onboarding workflow
   *   - Emit an NestJS event: this.eventEmitter.emit('verification.complete', summary)
   */
  private async handleResultNotification(
    payload: WebhookPayloadDto,
  ): Promise<void> {
    const containerId = payload.Callback.WorkflowStorage.ContainerId;
    this.logger.log(
      `Processing result notification for container: ${containerId}`,
    );

    try {
      // Fetch and parse the full result from TrustID's API
      const summary =
        await this.resultsService.getVerificationResult(containerId);

      this.logger.log(
        `Verification result for ${containerId}: outcome=${summary.overallOutcome}, isLive=${summary.isLive}`,
      );

      // TODO: Add your business logic here.
      // Examples:
      //   await this.userService.markVerified(summary.containerId);
      //   this.eventEmitter.emit('trustid.result', summary);
    } catch (error) {
      // Don't let a processing error crash the webhook handler — TrustID
      // has already received our 200 OK, so retrying won't help here.
      this.logger.error(
        `Failed to process result for container ${containerId}`,
        error,
      );
    }
  }

  /**
   * Fires when TrustID confirms they received the container and started processing.
   * Useful for updating a status indicator in your UI (e.g., "Under Review").
   */
  // Not async yet — add `async` and `await` when you implement the TODO body
  private handleContainerSubmitted(payload: WebhookPayloadDto): void {
    const containerId = payload.Callback.WorkflowStorage.ContainerId;
    this.logger.log(`Container submitted for processing: ${containerId}`);
    // TODO: update container status in your database to "processing"
  }

  /**
   * Fires when TrustID's automated check couldn't make a decision and a human
   * reviewer will look at the documents manually. This typically adds 1-4 hours
   * to the turnaround time.
   */
  // Not async yet — add `async` and `await` when you implement the TODO body
  private handleContainerSentToReview(payload: WebhookPayloadDto): void {
    const containerId = payload.Callback.WorkflowStorage.ContainerId;
    this.logger.warn(`Container sent to manual review: ${containerId}`);
    // TODO: notify applicant that manual review is in progress
  }

  /**
   * Fires when a document inside the container was changed after the initial result
   * (e.g., a reviewer corrected an OCR field). You may want to re-fetch the result.
   */
  // Not async yet — add `async` and `await` when you implement the TODO body
  private handleDocumentModifiedPostResult(payload: WebhookPayloadDto): void {
    const containerId = payload.Callback.WorkflowStorage.ContainerId;
    this.logger.log(
      `Document modified post-result for container: ${containerId}`,
    );
    // TODO: re-fetch and update the stored result if you're caching it
  }

  /**
   * Fires when the container itself was modified after the initial result.
   * Similar to the above but at the container level.
   */
  // Not async yet — add `async` and `await` when you implement the TODO body
  private handleContainerModifiedPostResult(payload: WebhookPayloadDto): void {
    const containerId = payload.Callback.WorkflowStorage.ContainerId;
    this.logger.log(`Container modified post-result: ${containerId}`);
    // TODO: re-fetch and update the stored result if you're caching it
  }
}
