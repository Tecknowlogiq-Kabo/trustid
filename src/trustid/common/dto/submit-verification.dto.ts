import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DocumentType } from '../enums/document-type.enum';

export class SubmitVerificationDto {
  @ApiPropertyOptional({
    description: 'Your internal applicant/user reference',
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @ApiPropertyOptional({ description: 'Callback URL for result webhook' })
  @IsOptional()
  @IsString()
  callbackUrl?: string;
}

export class CreateSelfServeDto {
  @ApiPropertyOptional({
    description: 'Your internal applicant/user reference',
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({
    description: 'URL to redirect applicant after completion',
  })
  @IsOptional()
  @IsString()
  redirectUrl?: string;

  @ApiPropertyOptional({
    description: 'Guest link expiry in minutes',
    minimum: 1,
  })
  @IsOptional()
  expiryMinutes?: number;
}
