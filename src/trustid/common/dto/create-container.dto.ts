import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateContainerDto {
  @ApiPropertyOptional({
    description: 'Your internal reference for this applicant/case',
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({
    description: 'Callback URL for TrustID to POST results to',
  })
  @IsOptional()
  @IsString()
  callbackUrl?: string;
}
