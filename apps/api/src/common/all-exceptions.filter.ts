import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : undefined;
    const message = this.extractMessage(exceptionResponse, exception);
    const requestId = request.requestId ?? response.getHeader('x-request-id')?.toString();

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed with ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      path: request.url,
      method: request.method,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private extractMessage(exceptionResponse: unknown, exception: unknown) {
    if (typeof exceptionResponse === 'string') return exceptionResponse;
    if (exceptionResponse && typeof exceptionResponse === 'object') {
      const value = (exceptionResponse as { message?: unknown }).message;
      if (Array.isArray(value)) return value.join('; ');
      if (typeof value === 'string') return value;
    }
    if (exception instanceof Error) return exception.message;
    return 'Internal server error';
  }
}
