import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DocumentType } from '../enums/document-type.enum';

export class SubmitVerificationDto {
  @ApiProperty({
    description: "The calling service's internal ID for the applicant being verified",
  })
  @IsString()
  @IsNotEmpty()
  applicantId: string;

  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @ApiPropertyOptional({ description: 'Callback URL for result webhook' })
  @IsOptional()
  @IsString()
  callbackUrl?: string;
}

export class CreateDelegatedVerificationDto {
  @ApiProperty({
    description: "The calling service's internal ID for the applicant being verified",
  })
  @IsString()
  @IsNotEmpty()
  applicantId: string;

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
