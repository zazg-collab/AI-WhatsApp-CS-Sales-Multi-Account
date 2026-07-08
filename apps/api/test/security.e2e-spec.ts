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
import { PrismaService } from '../src/prisma/prisma.service';
import { ConversationsController } from '../src/modules/conversations/conversations.controller';
import { ConversationsService } from '../src/modules/conversations/conversations.service';
import { ConversationMessagesController } from '../src/modules/conversations/conversation-messages.controller';
import { ConversationMessagingService } from '../src/modules/conversations/conversation-messaging.service';
import { ConversationChatOpsController } from '../src/modules/conversations/conversation-chat-ops.controller';
import { ConversationChatOpsService } from '../src/modules/conversations/conversation-chat-ops.service';

// Any service method called by a controller returns {} — we only assert the
// guard chain (auth/role), not service behavior, in this e2e.
const permissiveService = () =>
  new Proxy(
    {},
    {
      get: (_t, prop) => {
        // Don't answer `then`/symbol probes with a function, or Nest treats the
        // provider as a thenable and awaits it forever.
        if (prop === 'then' || typeof prop === 'symbol') return undefined;
        return jest.fn().mockResolvedValue({});
      },
    },
  ) as any;

/**
 * Security wiring (e2e): exercises the real JwtAuthGuard + RolesGuard chain
 * over HTTP against real controllers, verifying the C2 default-deny posture:
 *  - no token            → 401
 *  - viewer on mutations → 403 (role below required)
 *  - admin on mutations  → 200
 *  - undecorated mutation on a RolesGuard controller → 403 for everyone
 *
 * The token is identified only by `sub`; the *effective role* is re-loaded from
 * the database on every request (jwt.strategy.ts), so the user store below is
 * the source of truth — a deactivated/deleted/role-changed record takes effect
 * immediately, regardless of what the (still-valid) token claims.
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

interface StoreUser {
  id: string;
  email: string;
  role: string;
  status: string;
  deletedAt: Date | null;
}

describe('Security wiring (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  // Keyed by id (== token sub). Each role gets an active record so the
  // DB-revalidation in JwtStrategy resolves the same role the token implies.
  const userStore = new Map<string, StoreUser>([
    ['viewer', { id: 'viewer', email: 'viewer@x.com', role: 'viewer', status: 'active', deletedAt: null }],
    ['admin', { id: 'admin', email: 'admin@x.com', role: 'admin', status: 'active', deletedAt: null }],
    ['supervisor', { id: 'supervisor', email: 'sup@x.com', role: 'supervisor', status: 'active', deletedAt: null }],
    ['owner', { id: 'owner', email: 'owner@x.com', role: 'owner', status: 'active', deletedAt: null }],
    ['deactivated', { id: 'deactivated', email: 'd@x.com', role: 'owner', status: 'inactive', deletedAt: null }],
    ['deleted', { id: 'deleted', email: 'del@x.com', role: 'owner', status: 'active', deletedAt: new Date() }],
  ]);

  const prismaMock = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) => userStore.get(where.id) ?? null),
    },
  };

  const listMock = jest.fn().mockResolvedValue({ items: [], total: 0 });

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
      controllers: [
        ConversationsController,
        ConversationMessagesController,
        ConversationChatOpsController,
        WiringProbeController,
      ],
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConversationsService, useValue: { list: listMock } },
        { provide: ConversationMessagingService, useValue: permissiveService() },
        { provide: ConversationChatOpsService, useValue: permissiveService() },
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

  // sub == role id; the role itself is re-derived from userStore by the strategy.
  const tokenFor = (id: string) =>
    jwt.sign({ sub: id, email: `${id}@example.com`, role: id });

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
        sub: 'owner',
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

  describe('live re-validation (stale-token revocation)', () => {
    it('rejects a still-valid token whose user was deactivated', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenFor('deactivated')}`)
        .expect(401);
    });

    it('rejects a still-valid token whose user was soft-deleted', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenFor('deleted')}`)
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
    });

    it('blocks viewer from takeover', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/conversations/c1/takeover')
        .set('Authorization', `Bearer ${tokenFor('viewer')}`)
        .expect(403);
    });

    it('allows admin to send messages', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/conversations/c1/messages')
        .set('Authorization', `Bearer ${tokenFor('admin')}`)
        .send({ text: 'hi' })
        .expect(201);
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
