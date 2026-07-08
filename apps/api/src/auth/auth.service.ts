import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { logAudit } from '../common/audit.util';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        passwordHash: true,
        deletedAt: true,
      },
    });
    if (!user || user.status !== 'active' || user.deletedAt) {
      // Same generic message/action for "no such user" and "inactive" so the
      // response and the audit trail never reveal which case it was (no
      // account-enumeration signal), while still recording the attempt.
      await logAudit(this.prisma, {
        action: 'login_failed',
        entityType: 'user',
        entityId: dto.email,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await logAudit(this.prisma, {
        userId: user.id,
        action: 'login_failed',
        entityType: 'user',
        entityId: user.id,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    await logAudit(this.prisma, {
      userId: user.id,
      action: 'login',
      entityType: 'user',
      entityId: user.id,
    });

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, status: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException();
    const { deletedAt: _deletedAt, ...result } = user;
    return result;
  }
}
