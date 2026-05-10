import { registerAs } from '@nestjs/config';

export interface TrustIdConfig {
  username: string;
  password: string;
  deviceId: string;
  apiKey: string;
  baseUrl: string;
  sessionTtlSeconds: number;
  sessionRefreshBufferSeconds: number;
  webhookSecret?: string;
}

export default registerAs(
  'trustid',
  (): TrustIdConfig => ({
    username: process.env.TRUSTID_USERNAME!,
    password: process.env.TRUSTID_PASSWORD!,
    deviceId: process.env.TRUSTID_DEVICE_ID!,
    apiKey: process.env.TRUSTID_API_KEY!,
    baseUrl: process.env.TRUSTID_BASE_URL!,
    sessionTtlSeconds: parseInt(
      process.env.TRUSTID_SESSION_TTL_SECONDS ?? '3600',
      10,
    ),
    sessionRefreshBufferSeconds: parseInt(
      process.env.TRUSTID_SESSION_REFRESH_BUFFER_SECONDS ?? '60',
      10,
    ),
    webhookSecret: process.env.TRUSTID_WEBHOOK_SECRET || undefined,
  }),
);
