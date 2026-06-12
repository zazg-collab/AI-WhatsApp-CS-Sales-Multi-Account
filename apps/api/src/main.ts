import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SanitizationPipe } from './common/sanitization.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
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

  const config = new DocumentBuilder()
    .setTitle('Hermes Control Center API')
    .setDescription('Multi-account WhatsApp CS/Sales platform with AI supervisor')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);
   
  console.log(`Hermes API listening on http://localhost:${port}/api/v1`);
   
  console.log(`Swagger UI available at http://localhost:${port}/api/docs`);
}

bootstrap();
