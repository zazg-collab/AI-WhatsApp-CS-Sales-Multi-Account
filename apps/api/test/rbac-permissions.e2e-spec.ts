import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request = require('supertest');

jest.mock('../src/modules/wa/wa.service', () => ({ WaService: class {} }));

import { JwtStrategy } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';
import { CampaignsController } from '../src/modules/campaigns/campaigns.controller';
import { CampaignsService } from '../src/modules/campaigns/campaigns.service';

/**
 * RBAC permission matrix (e2e): asserts the per-endpoint role policy from the
 * RBAC audit end-to-end through the real JwtAuthGuard + RolesGuard, plus the
 * in-handler self-vs-other / owner-reset checks that the route guard alone
 * can't express. Services are mocked — we assert authorization status codes,
 * not business behavior.
 */
interface StoreUser {
  id: string;
  email: string;
  role: string;
  status: string;
  deletedAt: Date | null;
}

describe('RBAC permission matrix (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const userStore = new Map<string, StoreUser>(
    ['viewer', 'admin', 'supervisor', 'owner'].map((r) => [
      r,
      { id: r, email: `${r}@x.com`, role: r, status: 'active', deletedAt: null },
    ]),
  );

  const prismaMock = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) => userStore.get(where.id) ?? null),
    },
  };

  const usersServiceMock = {
    list: jest.fn().mockResolvedValue({ total: 0, users: [] }),
    create: jest.fn().mockResolvedValue({ id: 'new' }),
    get: jest.fn().mockResolvedValue({ id: 'x' }),
    update: jest.fn().mockResolvedValue({ id: 'x' }),
    delete: jest.fn().mockResolvedValue({ success: true }),
    changePassword: jest.fn().mockResolvedValue({ id: 'x' }),
    workload: jest.fn().mockResolvedValue([]),
  };
  const campaignsServiceMock = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then' || typeof prop === 'symbol') return undefined;
        return jest.fn().mockResolvedValue({ id: 'c1' });
      },
    },
  ) as any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => ({ JWT_SECRET: 'test-secret' })] }),
        PassportModule,
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [UsersController, CampaignsController],
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: prismaMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: CampaignsService, useValue: campaignsServiceMock },
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

  const as = (id: string) => `Bearer ${jwt.sign({ sub: id, email: `${id}@x.com`, role: id })}`;
  const srv = () => request(app.getHttpServer());

  describe('users: tier enforcement', () => {
    it('supervisor can list users, admin cannot', async () => {
      await srv().get('/api/v1/users').set('Authorization', as('supervisor')).expect(200);
      await srv().get('/api/v1/users').set('Authorization', as('admin')).expect(403);
    });

    it('only owner can create users', async () => {
      await srv().post('/api/v1/users').set('Authorization', as('owner'))
        .send({ email: 'n@x.com', password: 'password1', role: 'admin' }).expect(201);
      await srv().post('/api/v1/users').set('Authorization', as('supervisor'))
        .send({ email: 'n@x.com', password: 'password1', role: 'admin' }).expect(403);
    });

    it('only owner can delete users', async () => {
      await srv().delete('/api/v1/users/admin').set('Authorization', as('owner')).expect(200);
      await srv().delete('/api/v1/users/admin').set('Authorization', as('supervisor')).expect(403);
    });
  });

  describe('users: self-vs-other / privilege escalation', () => {
    it('blocks a non-owner from updating another user', async () => {
      await srv().patch('/api/v1/users/owner').set('Authorization', as('admin'))
        .send({ name: 'hacked' }).expect(403);
    });

    it('blocks a non-owner from changing their own role', async () => {
      await srv().patch('/api/v1/users/admin').set('Authorization', as('admin'))
        .send({ role: 'owner' }).expect(403);
      expect(usersServiceMock.update).not.toHaveBeenCalledWith(
        'admin', expect.objectContaining({ role: 'owner' }), expect.anything(),
      );
    });

    it('allows a user to update their own non-role fields', async () => {
      await srv().patch('/api/v1/users/admin').set('Authorization', as('admin'))
        .send({ name: 'My Name' }).expect(200);
    });
  });

  describe('users: password change / owner reset', () => {
    it('lets an owner reset another user\'s password without the old one', async () => {
      await srv().post('/api/v1/users/admin/change-password').set('Authorization', as('owner'))
        .send({ newPassword: 'brandnew1' }).expect(201);
      expect(usersServiceMock.changePassword).toHaveBeenLastCalledWith(
        'admin', expect.any(Object), 'owner', true,
      );
    });

    it('requires the current password for a self-service change', async () => {
      await srv().post('/api/v1/users/admin/change-password').set('Authorization', as('admin'))
        .send({ newPassword: 'brandnew1' }).expect(403);
    });

    it('blocks a non-owner from changing another user\'s password', async () => {
      await srv().post('/api/v1/users/owner/change-password').set('Authorization', as('admin'))
        .send({ oldPassword: 'x', newPassword: 'brandnew1' }).expect(403);
    });

    it('allows a self-service change with the current password', async () => {
      await srv().post('/api/v1/users/admin/change-password').set('Authorization', as('admin'))
        .send({ oldPassword: 'current1', newPassword: 'brandnew1' }).expect(201);
    });
  });

  describe('campaigns: approval is supervisor+', () => {
    it('blocks admin from approving a campaign', async () => {
      await srv().post('/api/v1/campaigns/c1/approve').set('Authorization', as('admin')).expect(403);
    });

    it('allows supervisor to approve a campaign', async () => {
      await srv().post('/api/v1/campaigns/c1/approve').set('Authorization', as('supervisor')).expect(201);
    });

    it('allows admin to create a campaign but not start it', async () => {
      await srv().post('/api/v1/campaigns').set('Authorization', as('admin'))
        .send({ name: 'c', message: 'hi' }).expect(201);
      await srv().post('/api/v1/campaigns/c1/start').set('Authorization', as('admin')).expect(403);
    });

    it('blocks viewer from creating a campaign', async () => {
      await srv().post('/api/v1/campaigns').set('Authorization', as('viewer'))
        .send({ name: 'c', message: 'hi' }).expect(403);
    });
  });
});
