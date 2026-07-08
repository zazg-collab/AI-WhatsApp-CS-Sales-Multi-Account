import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SanitizationPipe } from './common/sanitization.pipe';
import { StructuredLogger } from './common/structured-logger';
import { ErrorReporterService } from './common/error-reporter.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // Machine-parseable JSON logs with per-request correlation ids.
  app.useLogger(new StructuredLogger());
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new SanitizationPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // CORS (H9): never reflect arbitrary origins while allowing credentials.
  // Allow an explicit comma-separated allowlist via CORS_ORIGINS, falling back
  // to the configured web origin.
  const corsOrigins = (process.env.CORS_ORIGINS ?? process.env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.enableShutdownHooks();

  // Don't expose the full API schema (every route, DTO, and auth shape) in
  // production by default — it's a free recon map for an attacker. Enable in
  // prod only with an explicit SWAGGER_ENABLED=true opt-in.
  const swaggerEnabled =
    process.env.SWAGGER_ENABLED === 'true' || process.env.NODE_ENV !== 'production';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Hermes Control Center API')
      .setDescription('Multi-account WhatsApp CS/Sales platform with AI supervisor')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Last-resort capture for failures outside the request lifecycle — these would
  // otherwise crash the process silently with no record.
  const reporter = app.get(ErrorReporterService);
  process.on('unhandledRejection', (reason) =>
    reporter.capture(reason, { kind: 'unhandledRejection' }),
  );
  process.on('uncaughtException', (err) =>
    reporter.capture(err, { kind: 'uncaughtException' }),
  );

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Hermes API listening on http://localhost:${port}/api/v1`);
  if (swaggerEnabled) {
    logger.log(`Swagger UI available at http://localhost:${port}/api/docs`);
  }
}

bootstrap();
