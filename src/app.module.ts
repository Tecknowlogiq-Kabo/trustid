import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import trustidConfig from './trustid/config/trustid.config';
import { TrustIdModule } from './trustid/trustid.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [trustidConfig],
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        TRUSTID_USERNAME: Joi.string().required(),
        TRUSTID_PASSWORD: Joi.string().required(),
        TRUSTID_DEVICE_ID: Joi.string().required(),
        TRUSTID_API_KEY: Joi.string().required(),
        TRUSTID_BASE_URL: Joi.string().uri().required(),
        TRUSTID_SESSION_TTL_SECONDS: Joi.number().default(3600),
        TRUSTID_SESSION_REFRESH_BUFFER_SECONDS: Joi.number().default(60),
        TRUSTID_WEBHOOK_SECRET: Joi.string().optional().allow(''),
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TrustIdModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
