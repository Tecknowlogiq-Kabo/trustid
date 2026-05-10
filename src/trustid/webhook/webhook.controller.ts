import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TrustIdExceptionFilter } from '../common/exceptions/trustid-exception.filter';
import { WebhookPayloadDto } from '../common/dto/webhook-payload.dto';
import { WebhookService } from './webhook.service';

/**
 * WebhookController — the public HTTP endpoint that TrustID calls when something happens.
 *
 * HOW WEBHOOKS WORK (for junior devs):
 * Instead of us constantly asking TrustID "are you done yet?" (polling),
 * TrustID calls *us* when processing is complete. We give TrustID a URL
 * (configured in your TrustID account settings or per-container callbackUrl),
 * and TrustID will POST a JSON payload to that URL whenever an event occurs.
 *
 * CRITICAL DETAIL — respond quickly:
 * TrustID expects an HTTP 200 response within a few seconds. If our handler
 * takes too long (e.g. it queries a database), TrustID will assume the delivery
 * failed and retry up to 3 times with 5-minute gaps. To avoid this:
 *   1. We return 200 IMMEDIATELY (before doing any real work).
 *   2. We hand the payload off to WebhookService using setImmediate(), which
 *      schedules the work to run after the HTTP response has been sent.
 *
 * This "fire-and-forget" pattern keeps our response time under 10ms
 * regardless of how long the actual processing takes.
 *
 * ENDPOINT: POST /api/v1/webhooks/trustid
 * Configure this URL in your TrustID account or via the callbackUrl field
 * when creating a container.
 */
@ApiTags('webhooks')
@Controller('webhooks/trustid')
@UseFilters(TrustIdExceptionFilter) // converts TrustIdException into a clean JSON error response
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  /**
   * Receives all TrustID webhook events (TrustID sends all event types to a single URL).
   *
   * The body is validated by WebhookPayloadDto using class-validator — if TrustID
   * sends a malformed payload, NestJS will automatically return a 400 Bad Request
   * before this method is even called.
   */
  @Post()
  @HttpCode(HttpStatus.OK) // always respond 200, even if processing fails later
  @ApiOperation({ summary: 'Receive TrustID webhook events' })
  @ApiResponse({ status: 200, description: 'Event acknowledged' })
  receiveWebhook(@Body() payload: WebhookPayloadDto): { received: boolean } {
    // setImmediate() queues the dispatch work to run AFTER the HTTP response is sent.
    // Think of it like saying "do this in the background — don't make the caller wait."
    setImmediate(() => {
      this.webhookService.dispatch(payload).catch((error: unknown) => {
        // We can't propagate this error to the HTTP caller (response already sent),
        // so we log it and rely on TrustID's retry mechanism to re-deliver.
        this.logger.error('Webhook dispatch failed', error);
      });
    });

    // Return immediately — processing continues in the background above
    return { received: true };
  }
}
