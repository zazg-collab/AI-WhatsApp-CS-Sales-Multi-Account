import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { HealthController } from '../src/health.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Health (e2e)', () => {
  let app: INestApplication;

  const prismaMock = {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ JWT_SECRET: 's', DATABASE_URL: 'x', REDIS_URL: 'y' })],
        }),
      ],
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health → 200 ok', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('hermes-api');
  });

  it('GET /api/v1/health/config → returns config summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/config')
      .expect(200);
    expect(res.body.jwtConfigured).toBe(true);
    expect(res.body.databaseConfigured).toBe(true);
    expect(res.body.ai).toBeDefined();
  });

  it('GET /api/v1/health/ready → ok when checks pass', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);
    expect(res.body.status).toBe('ok');
  });
});
