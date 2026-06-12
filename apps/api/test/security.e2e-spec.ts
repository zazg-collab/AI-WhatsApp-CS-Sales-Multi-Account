import { Controller, Get, INestApplication, Post, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request = require('supertest');

jest.mock('../src/modules/wa/wa.service', () => ({ WaService: class {} }));

import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { Roles, RolesGuard } from '../src/auth/roles';
import { ConversationsController } from '../src/modules/conversations/conversations.controller';
import { ConversationsService } from '../src/modules/conversations/conversations.service';

/**
 * Security wiring (e2e): exercises the real JwtAuthGuard + RolesGuard chain
 * over HTTP against real controllers, verifying the C2 default-deny posture:
 *  - no token            → 401
 *  - viewer on mutations → 403 (role below required)
 *  - admin on mutations  → 200
 *  - undecorated mutation on a RolesGuard controller → 403 for everyone
 */
@Controller('wiring-probe')
@UseGuards(JwtAuthGuard, RolesGuard)
class WiringProbeController {
  // Deliberately NOT decorated with @Roles: default-deny must block it.
  @Post('undecorated')
  undecorated() {
    return { reached: true };
  }

  @Roles('viewer')
  @Get('decorated')
  decorated() {
    return { reached: true };
  }
}

describe('Security wiring (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const conversationsMock = {
    send: jest.fn().mockResolvedValue({ id: 'm1' }),
    takeover: jest.fn().mockResolvedValue({ id: 'c1' }),
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ JWT_SECRET: 'test-secret' })],
        }),
        PassportModule,
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [ConversationsController, WiringProbeController],
      providers: [
        JwtStrategy,
        { provide: ConversationsService, useValue: conversationsMock },
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

  const tokenFor = (role: string) =>
    jwt.sign({ sub: 'u1', email: 'u@example.com', role });

  describe('authentication (C1/C3)', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/conversations/c1/messages')
        .send({ text: 'hi' })
        .expect(401);
    });

    it('rejects forged tokens signed with a different secret', async () => {
      const { JwtService: Jwt } = jest.requireActual('@nestjs/jwt');
      const forged = new Jwt({ secret: 'wrong-secret' }).sign({
        sub: 'u1',
        email: 'u@example.com',
        role: 'owner',
      });
      await request(app.getHttpServer())
        .post('/api/v1/conversations/c1/messages')
        .set('Authorization', `Bearer ${forged}`)
        .send({ text: 'hi' })
        .expect(401);
    });
  });

  describe('role enforcement (C2)', () => {
    it('blocks viewer from sending messages', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/conversations/c1/messages')
        .set('Authorization', `Bearer ${tokenFor('viewer')}`)
        .send({ text: 'hi' })
        .expect(403);
      expect(conversationsMock.send).not.toHaveBeenCalled();
    });

    it('blocks viewer from takeover', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/conversations/c1/takeover')
        .set('Authorization', `Bearer ${tokenFor('viewer')}`)
        .expect(403);
      expect(conversationsMock.takeover).not.toHaveBeenCalled();
    });

    it('allows admin to send messages', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/conversations/c1/messages')
        .set('Authorization', `Bearer ${tokenFor('admin')}`)
        .send({ text: 'hi' })
        .expect(201);
      expect(conversationsMock.send).toHaveBeenCalled();
    });

    it('allows viewer to read (list has no role restriction beyond auth)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenFor('viewer')}`)
        .expect(200);
    });
  });

  describe('default-deny (C2)', () => {
    it('blocks every role on an undecorated guarded mutation', async () => {
      for (const role of ['viewer', 'admin', 'supervisor', 'owner']) {
        await request(app.getHttpServer())
          .post('/api/v1/wiring-probe/undecorated')
          .set('Authorization', `Bearer ${tokenFor(role)}`)
          .expect(403);
      }
    });

    it('still allows decorated routes at the minimum role', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/wiring-probe/decorated')
        .set('Authorization', `Bearer ${tokenFor('viewer')}`)
        .expect(200);
    });
  });
});
