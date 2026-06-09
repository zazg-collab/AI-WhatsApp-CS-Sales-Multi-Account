import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * List users with optional role filter and pagination.
   * Excludes passwordHash from response.
   */
  async list(filters: {
    role?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const { role, limit = 20, offset = 0 } = filters;
    const where: any = {};
    if (role) where.role = role;

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return { total, limit, offset, users };
  }

  /**
   * Create a new user with hashed password.
   */
  async create(dto: CreateUserDto, creatorId: string) {
    // Check if email already exists
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        name: dto.name || dto.email.split('@')[0],
        email: dto.email,
        passwordHash,
        role: (dto.role as Role) || Role.admin,
        status: 'active',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log action
    await this.audit.log(creatorId, 'user_created', 'User', user.id, user);

    return user;
  }

  /**
   * Get a user by ID without password.
   */
  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Update user (email, role, name).
   */
  async update(id: string, dto: UpdateUserDto, updaterId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    // Check if new email already exists (if changing email)
    if (dto.email && dto.email !== existing.email) {
      const conflict = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (conflict) throw new ConflictException('Email already exists');
    }

    const oldValue = {
      email: existing.email,
      role: existing.role,
      name: existing.name,
    };

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email && { email: dto.email }),
        ...(dto.role && { role: dto.role as Role }),
        ...(dto.name && { name: dto.name }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const newValue = {
      email: user.email,
      role: user.role,
      name: user.name,
    };

    // Log action
    await this.audit.log(updaterId, 'user_updated', 'User', id, { oldValue, newValue });

    return user;
  }

  /**
   * Hard delete a user.
   */
  async delete(id: string, deleterId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    await this.prisma.user.delete({ where: { id } });

    // Log action
    await this.audit.log(deleterId, 'user_deleted', 'User', id, { deletedUser: existing });

    return { success: true };
  }

  /**
   * Change password: verify old password, hash new password.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Verify old password
    const valid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Old password is incorrect');

    // Hash new password
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    // Update
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updated;
  }
}
