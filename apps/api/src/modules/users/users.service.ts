import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role } from '@sentinel/database';
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
   * Excludes deleted users and passwordHash from response.
   */
  async list(filters: {
    role?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const { role, limit = 20, offset = 0 } = filters;
    const where: any = { deletedAt: null };
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
   * Active admins (owner/supervisor/admin) ranked by current open-conversation
   * load (ascending), so the UI can default/suggest the least-busy admin for
   * assignment. Open = status open|pending and assigned to that admin.
   */
  async workload() {
    const admins = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'active', role: { in: [Role.owner, Role.supervisor, Role.admin] } },
      select: { id: true, name: true, email: true, role: true },
    });
    const grouped = await this.prisma.conversation.groupBy({
      by: ['assignedAdminId'],
      where: { assignedAdminId: { in: admins.map((a) => a.id) }, status: { in: ['open', 'pending'] } },
      _count: { id: true },
    });
    const counts = new Map(grouped.map((g) => [g.assignedAdminId, g._count.id]));
    return admins
      .map((a) => ({ ...a, openCount: counts.get(a.id) ?? 0 }))
      .sort((a, b) => a.openCount - b.openCount);
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
   * Excludes soft-deleted users.
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
        deletedAt: true,
      },
    });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    const { deletedAt: _deletedAt, ...result } = user;
    return result;
  }

  /**
   * Update user (email, role, name).
   */
  async update(id: string, dto: UpdateUserDto, updaterId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        deletedAt: true,
      },
    });
    if (!existing || existing.deletedAt) throw new NotFoundException('User not found');

    // Block demoting the last remaining owner (lockout protection).
    if (dto.role && dto.role !== Role.owner && existing.role === Role.owner) {
      await this.assertNotLastOwner(id);
    }

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
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        deletedAt: true,
      },
    });
    if (!existing || existing.deletedAt) throw new NotFoundException('User not found');

    // Block deleting the last remaining owner (lockout protection).
    await this.assertNotLastOwner(id);

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Log action
    await this.audit.log(deleterId, 'user_deleted', 'User', id, { deletedUser: existing });

    return { success: true };
  }

  /**
   * Change password.
   *
   * Normal (self-service) path verifies the caller's current password. An
   * owner resetting *another* user's forgotten password passes
   * `skipOldPasswordCheck` — they can't know the victim's old password, so the
   * old-password gate would make admin reset impossible. The controller only
   * sets this flag for an owner acting on a different account. Every change is
   * audited (without logging the password itself).
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    actorId: string,
    skipOldPasswordCheck = false,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!skipOldPasswordCheck) {
      // Verify old password
      const valid = await bcrypt.compare(dto.oldPassword ?? '', user.passwordHash);
      if (!valid) throw new BadRequestException('Old password is incorrect');
    }

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

    await this.audit.log(actorId, 'user_password_changed', 'User', userId, {
      reset: skipOldPasswordCheck,
    });

    return updated;
  }

  /**
   * Throw if changing/removing this user's owner role would leave the system
   * with no active owner. Called before role downgrade and before delete.
   */
  private async assertNotLastOwner(targetId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true },
    });
    if (target?.role !== Role.owner) return;
    const otherOwners = await this.prisma.user.count({
      where: {
        id: { not: targetId },
        role: Role.owner,
        status: 'active',
        deletedAt: null,
      },
    });
    if (otherOwners === 0) {
      throw new BadRequestException(
        'Cannot remove the last active owner — assign another owner first',
      );
    }
  }
}
