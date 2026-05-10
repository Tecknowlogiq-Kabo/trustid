import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WebhookStorageDto {
  @IsString()
  ContainerId: string;
}

export class WebhookCallbackDto {
  @IsString()
  CallbackId: string;

  @IsString()
  WorkflowName: string;

  @IsString()
  WorkflowState: string;

  @IsString()
  CallbackAt: string;

  @IsString()
  CallbackUrl: string;

  @IsInt()
  RetryCounter: number;

  @IsOptional()
  @IsString()
  ErrorMessage?: string;

  @ValidateNested()
  @Type(() => WebhookStorageDto)
  WorkflowStorage: WebhookStorageDto;
}

export class WebhookResponseDto {
  @IsBoolean()
  Success: boolean;

  @IsString()
  Message: string;

  @IsString()
  ContainerId: string;

  @IsOptional()
  @IsBoolean()
  AutoReferred?: boolean;
}

export class WebhookPayloadDto {
  @ValidateNested()
  @Type(() => WebhookCallbackDto)
  Callback: WebhookCallbackDto;

  @IsObject()
  @ValidateNested()
  @Type(() => WebhookResponseDto)
  Response: WebhookResponseDto;
}
