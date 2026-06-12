import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: { id?: string }; requestId?: string }>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const requestId = request.requestId ?? response.getHeader('x-request-id')?.toString();

    return next.handle().pipe(
      tap({
        next: () => this.log(request, response, startedAt, requestId),
        error: () => this.log(request, response, startedAt, requestId),
      }),
    );
  }

  private log(
    request: Request & { user?: { id?: string } },
    response: Response,
    startedAt: number,
    requestId?: string,
  ) {
    const durationMs = Date.now() - startedAt;
    this.logger.log(JSON.stringify({
      requestId,
      method: request.method,
      path: request.originalUrl ?? request.url,
      statusCode: response.statusCode,
      durationMs,
      ip: request.ip,
      userId: request.user?.id,
    }));
  }
}
