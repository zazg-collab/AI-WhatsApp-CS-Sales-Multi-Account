import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@sentinel/database';
import { Request, Response } from 'express';
import { ErrorReporterService } from './error-reporter.service';

/**
 * A11: well-known Prisma errors map to client errors instead of opaque 500s —
 * e.g. assigning a nonexistent bot/admin id used to surface as a 500.
 */
const PRISMA_STATUS: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'A record with this value already exists' },
  P2003: { status: HttpStatus.BAD_REQUEST, message: 'Referenced record does not exist' },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Record not found' },
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  // Optional: present when DI provides it (it does in the running app). Kept
  // optional so unit tests can `new AllExceptionsFilter()` without a reporter.
  constructor(private readonly reporter?: ErrorReporterService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const prismaMapping =
      exception instanceof Prisma.PrismaClientKnownRequestError
        ? PRISMA_STATUS[exception.code]
        : undefined;
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : prismaMapping?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : undefined;
    const message = prismaMapping?.message ?? this.extractMessage(exceptionResponse, exception);
    const requestId = request.requestId ?? response.getHeader('x-request-id')?.toString();

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed with ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      // Forward to the central error sink (structured log + optional webhook).
      this.reporter?.capture(exception, {
        route: request.url,
        method: request.method,
        status,
        requestId,
      });
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
