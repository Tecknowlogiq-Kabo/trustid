import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class CreateGuestLinkDto {
  @ApiProperty({ description: 'TrustID container ID' })
  @IsString()
  containerId: string;

  @ApiPropertyOptional({
    description: 'URL to redirect applicant to after completion',
  })
  @IsOptional()
  @IsUrl()
  redirectUrl?: string;

  @ApiPropertyOptional({
    description: 'Minutes before the guest link expires',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expiryMinutes?: number;
}
