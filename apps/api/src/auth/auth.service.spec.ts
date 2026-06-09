import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

jest.mock('bcryptjs');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwt: any;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    jwt = { signAsync: jest.fn().mockResolvedValue('token123') };
    service = new AuthService(prisma, jwt);
  });

  describe('login', () => {
    const dto = { email: 'a@b.com', password: 'secret' };

    it('returns token + user on valid creds', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: 'Admin',
        role: 'owner',
        status: 'active',
        passwordHash: 'hash',
      });
      mockedBcrypt.compare.mockResolvedValue(true as never);

      const result = await service.login(dto);
      expect(result.accessToken).toBe('token123');
      expect(result.user).toEqual({
        id: 'u1',
        name: 'Admin',
        email: 'a@b.com',
        role: 'owner',
      });
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 'u1',
        email: 'a@b.com',
        role: 'owner',
      });
    });

    it('throws when user missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws when user not active', async () => {
      prisma.user.findUnique.mockResolvedValue({ status: 'disabled', passwordHash: 'h' });
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws on wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({ status: 'active', passwordHash: 'h' });
      mockedBcrypt.compare.mockResolvedValue(false as never);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('me', () => {
    it('returns the user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'A' });
      expect(await service.me('u1')).toEqual({ id: 'u1', name: 'A' });
    });
    it('throws when not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.me('x')).rejects.toThrow(UnauthorizedException);
    });
  });
});
