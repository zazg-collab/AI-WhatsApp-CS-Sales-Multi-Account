import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { currentContext } from './request-context';
import { MetricsService } from './metrics/metrics.service';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  // Optional so unit tests can construct the interceptor without metrics.
  constructor(private readonly metrics?: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: { id?: string }; requestId?: string }>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const requestId = request.requestId ?? response.getHeader('x-request-id')?.toString();

    // Now that auth guards have run, attach userId to the ambient context so all
    // subsequent log lines for this request carry it.
    if (request.user?.id) currentContext().userId = request.user.id;

    // Low-cardinality route label: Controller#handler, never the raw URL (which
    // contains ids and would explode Prometheus label cardinality).
    const route = `${context.getClass().name}#${context.getHandler().name}`;

    return next.handle().pipe(
      tap({
        next: () => this.finish(request, response, startedAt, requestId, route),
        error: () => this.finish(request, response, startedAt, requestId, route),
      }),
    );
  }

  private finish(
    request: Request & { user?: { id?: string } },
    response: Response,
    startedAt: number,
    requestId: string | undefined,
    route: string,
  ) {
    const durationMs = Date.now() - startedAt;
    const status = String(response.statusCode);
    const method = request.method;

    this.metrics?.httpDuration.observe({ method, route, status }, durationMs / 1000);
    this.metrics?.httpTotal.inc({ method, route, status });

    this.logger.log(JSON.stringify({
      requestId,
      method,
      route,
      path: request.originalUrl ?? request.url,
      statusCode: response.statusCode,
      durationMs,
      ip: request.ip,
      userId: request.user?.id,
    }));
  }
}
