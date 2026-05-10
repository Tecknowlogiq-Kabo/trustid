import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { TrustIdException } from './trustid.exception';

@Catch(TrustIdException)
export class TrustIdExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(TrustIdExceptionFilter.name);

  catch(exception: TrustIdException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const statusCode = exception.statusCode ?? HttpStatus.BAD_GATEWAY;

    this.logger.error(
      `TrustID error [${statusCode}]: ${exception.message}`,
      exception.trustIdError,
    );

    response.status(statusCode).json({
      error: exception.name,
      message: exception.message,
      statusCode,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
