import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request = require('supertest');
import { HealthController } from '../src/health.controller';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Health (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const prismaMock = {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    // JwtStrategy re-validates against the DB on every request; the token's
    // `sub` carries the role so the strategy resolves an active user with it.
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) => ({
        id: where.id,
        email: `${where.id}@x.com`,
        role: where.id,
        status: 'active',
        deletedAt: null,
      })),
    },
  };

  const healthQueueMock = {
    client: Promise.resolve({ ping: jest.fn().mockResolvedValue('PONG') }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ JWT_SECRET: 'test-secret', DATABASE_URL: 'x', REDIS_URL: 'y' })],
        }),
        PassportModule,
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [HealthController],
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: prismaMock },
        { provide: getQueueToken('health'), useValue: healthQueueMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  // sub carries the role; the strategy re-derives the effective role from the DB.
  const tokenFor = (role: string) =>
    jwt.sign({ sub: role, email: 'u@example.com', role });

  it('GET /api/v1/health → 200 ok', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('hermes-api');
  });

  it('GET /api/v1/health/config → 401 without JWT (M5)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/config')
      .expect(401);
  });

  it('GET /api/v1/health/config → 403 for admin role (M5)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/config')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .expect(403);
  });

  it('GET /api/v1/health/config → 200 for owner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/config')
      .set('Authorization', `Bearer ${tokenFor('owner')}`)
      .expect(200);
    expect(res.body.jwtConfigured).toBe(true);
    expect(res.body.databaseConfigured).toBe(true);
    expect(res.body.ai).toBeDefined();
  });

  it('GET /api/v1/health/ready → ok when checks pass (incl. Redis ping)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'redis', status: 'ok' })]),
    );
  });
});
