import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';

jest.mock('bcryptjs');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let audit: any;

  const safeUser = {
    id: 'u1',
    name: 'Admin',
    email: 'a@b.com',
    role: 'admin',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([safeUser]),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue(safeUser),
        update: jest.fn().mockResolvedValue(safeUser),
        delete: jest.fn().mockResolvedValue(safeUser),
      },
    };
    audit = { log: jest.fn().mockResolvedValue({}) };
    service = new UsersService(prisma, audit);
  });

  describe('list', () => {
    it('returns paginated users with role filter', async () => {
      const r = await service.list({ role: 'admin', limit: 10, offset: 0 });
      expect(r.total).toBe(1);
      expect(r.users).toHaveLength(1);
      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ role: 'admin' });
    });
  });

  describe('create', () => {
    it('hashes password and excludes hash from response', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const hashSpy = mockedBcrypt.hash.mockResolvedValue('hashed' as never);
      const r = await service.create(
        { email: 'new@b.com', password: 'pw', name: 'New', role: 'admin' } as any,
        'creator',
      );
      expect(hashSpy).toHaveBeenCalledWith('pw', 10);
      expect(prisma.user.create.mock.calls[0][0].data.passwordHash).toBe('hashed');
      expect((r as any).passwordHash).toBeUndefined();
      expect(audit.log).toHaveBeenCalled();
    });
    it('throws on duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue(safeUser);
      await expect(
        service.create({ email: 'a@b.com', password: 'pw' } as any, 'c'),
      ).rejects.toThrow(ConflictException);
    });
    it('defaults name from email local-part', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      mockedBcrypt.hash.mockResolvedValue('h' as never);
      await service.create({ email: 'foo@bar.com', password: 'pw' } as any, 'c');
      expect(prisma.user.create.mock.calls[0][0].data.name).toBe('foo');
    });
  });

  describe('get', () => {
    it('throws when not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.get('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws when user missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.update('x', {} as any, 'u')).rejects.toThrow(NotFoundException);
    });
    it('rejects email conflict', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ ...safeUser, email: 'old@b.com' })
        .mockResolvedValueOnce({ id: 'other' });
      await expect(
        service.update('u1', { email: 'taken@b.com' } as any, 'u'),
      ).rejects.toThrow(ConflictException);
    });
    it('updates fields', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(safeUser);
      await service.update('u1', { name: 'Renamed' } as any, 'u');
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({ name: 'Renamed' });
    });
  });

  describe('delete', () => {
    it('throws when missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.delete('x', 'u')).rejects.toThrow(NotFoundException);
    });
    it('deletes and audits', async () => {
      prisma.user.findUnique.mockResolvedValue(safeUser);
      const r = await service.delete('u1', 'deleter');
      expect(r).toEqual({ success: true });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });

  describe('changePassword', () => {
    it('throws when user missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.changePassword('x', { oldPassword: 'o', newPassword: 'n' } as any),
      ).rejects.toThrow(NotFoundException);
    });
    it('throws when old password wrong', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...safeUser, passwordHash: 'h' });
      mockedBcrypt.compare.mockResolvedValue(false as never);
      await expect(
        service.changePassword('u1', { oldPassword: 'bad', newPassword: 'n' } as any),
      ).rejects.toThrow(BadRequestException);
    });
    it('hashes new password when old verifies', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...safeUser, passwordHash: 'h' });
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockedBcrypt.hash.mockResolvedValue('newhash' as never);
      await service.changePassword('u1', { oldPassword: 'o', newPassword: 'n' } as any);
      expect(prisma.user.update.mock.calls[0][0].data.passwordHash).toBe('newhash');
    });
  });
});
