import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class SubmitVerificationDto {
  @ApiProperty({
    description: 'Type of identity document being verified',
    enum: ['Passport', 'DrivingLicence', 'NationalId', 'BRP', 'Visa'],
  })
  @IsString()
  @IsIn(['Passport', 'DrivingLicence', 'NationalId', 'BRP', 'Visa'])
  documentType: string;

  @ApiPropertyOptional({ description: 'Callback URL for result webhook' })
  @IsOptional()
  @IsString()
  callbackUrl?: string;
}

export class CreateDelegatedVerificationDto {
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
