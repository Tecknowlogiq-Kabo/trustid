import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseFilters,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { TrustIdExceptionFilter } from './common/exceptions/trustid-exception.filter';
import {
  CreateDelegatedVerificationDto,
  SubmitVerificationDto,
} from './common/dto/submit-verification.dto';
import { CreateGuestLinkDto } from './common/dto/create-guest-link.dto';
import { AdvancedQueryDto } from './common/dto/advanced-query.dto';
import { OrchestrationService } from './orchestration/orchestration.service';
import { ResultsService } from './results/results.service';
import { ContainerService } from './container/container.service';
import { GuestLinkService } from './guest-link/guest-link.service';
import { TrustIdAuthService } from './auth/auth.service';
import { DocumentType } from './common/enums/document-type.enum';

@ApiTags('trustid')
@Controller('trustid')
@UseFilters(TrustIdExceptionFilter)
export class TrustIdController {
  constructor(
    private readonly orchestration: OrchestrationService,
    private readonly results: ResultsService,
    private readonly containers: ContainerService,
    private readonly guestLinks: GuestLinkService,
    private readonly authService: TrustIdAuthService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Check TrustID session health' })
  @ApiResponse({ status: 200 })
  health() {
    const state = this.authService.getSessionState();
    return {
      connected: !!state,
      expiresAt: state?.expiresAt ?? null,
    };
  }

  @Post('verify')
  @ApiOperation({
    summary: 'Submit a full identity verification (backend uploads all images)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['applicantId', 'documentType', 'frontImage', 'selfie'],
      properties: {
        applicantId: { type: 'string' },
        documentType: {
          type: 'number',
          enum: Object.values(DocumentType).filter(
            (v) => typeof v === 'number',
          ),
        },
        callbackUrl: { type: 'string' },
        frontImage: { type: 'string', format: 'binary' },
        backImage: { type: 'string', format: 'binary' },
        selfie: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'frontImage', maxCount: 1 },
      { name: 'backImage', maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
    ]),
  )
  async submitVerification(
    @Body() dto: SubmitVerificationDto,
    @UploadedFiles()
    files: {
      frontImage?: Express.Multer.File[];
      backImage?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
    },
  ) {
    return this.orchestration.submitVerification({
      ...dto,
      frontImageBuffer: files.frontImage![0].buffer,
      backImageBuffer: files.backImage?.[0]?.buffer,
      selfieBuffer: files.selfie![0].buffer,
    });
  }

  @Post('session')
  @ApiOperation({
    summary: 'Create a Delegated Verification session (guest link escape hatch)',
  })
  async createDelegatedVerification(@Body() dto: CreateDelegatedVerificationDto) {
    return this.orchestration.createDelegatedVerification(dto);
  }

  @Post('guest-link')
  @ApiOperation({ summary: 'Create a guest link for an existing container' })
  async createGuestLink(@Body() dto: CreateGuestLinkDto) {
    return this.guestLinks.createGuestLink(dto);
  }

  @Get('results/:verificationId')
  @ApiOperation({ summary: 'Retrieve verification result summary' })
  @ApiParam({ name: 'verificationId', type: String })
  async getResult(@Param('verificationId') verificationId: string) {
    return this.results.getVerificationResult(verificationId);
  }

  @Get('results/:verificationId/pdf')
  @ApiOperation({ summary: 'Download PDF report for a verified container' })
  @ApiParam({ name: 'verificationId', type: String })
  async downloadPdf(
    @Param('verificationId') verificationId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.containers.exportPdf(verificationId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="trustid-report-${verificationId}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }

  @Post('query')
  @ApiOperation({ summary: 'Advanced container search' })
  async query(@Body() dto: AdvancedQueryDto) {
    return this.containers.advancedQuery(dto);
  }

  @Post('query/archive')
  @ApiOperation({ summary: 'Archive container search' })
  async archiveQuery(@Body() dto: AdvancedQueryDto) {
    return this.containers.archiveContainerQuery(dto);
  }
}
