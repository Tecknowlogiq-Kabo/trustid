import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateContainerDto {
  @ApiProperty({
    description: "The calling service's internal ID for the applicant being verified",
  })
  @IsString()
  @IsNotEmpty()
  applicantId: string;

  @ApiPropertyOptional({
    description: 'Callback URL for TrustID to POST results to',
  })
  @IsOptional()
  @IsString()
  callbackUrl?: string;
}
