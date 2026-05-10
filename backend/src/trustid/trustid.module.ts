import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TrustIdConfig } from './config/trustid.config';

import { TrustIdAuthService } from './auth/auth.service';
import { TrustIdHttpService } from './http/trustid-http.service';
import { ContainerService } from './container/container.service';
import { DocumentService } from './document/document.service';
import { FaceService } from './face/face.service';
import { GuestLinkService } from './guest-link/guest-link.service';
import { ResultsService } from './results/results.service';
import { WebhookService } from './webhook/webhook.service';
import { WebhookController } from './webhook/webhook.controller';
import { OrchestrationService } from './orchestration/orchestration.service';
import { TrustIdController } from './trustid.controller';

@Module({
  imports: [
    ConfigModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const config = configService.get<TrustIdConfig>('trustid')!;
        return {
          baseURL: config.baseUrl,
          timeout: 30_000,
          headers: { 'Content-Type': 'application/json' },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [WebhookController, TrustIdController],
  providers: [
    TrustIdAuthService,
    TrustIdHttpService,
    ContainerService,
    DocumentService,
    FaceService,
    GuestLinkService,
    ResultsService,
    WebhookService,
    OrchestrationService,
  ],
  exports: [
    OrchestrationService,
    ResultsService,
    ContainerService,
    DocumentService,
    FaceService,
    GuestLinkService,
    TrustIdAuthService,
  ],
})
export class TrustIdModule {}
