import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * List users — owner/supervisor only.
   */
  @Roles('owner', 'supervisor')
  @Get()
  list(
    @Query('role') role?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.users.list({
      role,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /**
   * Create a new user — owner only.
   */
  @Roles('owner')
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.create(dto, user.id);
  }

  /**
   * Get a user by ID — self or owner/supervisor.
   */
  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // Allow user to fetch their own details, or owner/supervisor to fetch any user
    if (id !== user.id && user.role !== 'owner' && user.role !== 'supervisor') {
      throw new ForbiddenException('You do not have permission to view this user');
    }
    return this.users.get(id);
  }

  /**
   * Update a user — self (limited fields) or owner.
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Allow user to update their own email/name, or owner to update anything
    if (id !== user.id && user.role !== 'owner') {
      // Self-update: only allow email/name, not role
      if (dto.role) {
        throw new ForbiddenException('You can only update your own email/name');
      }
    }
    return this.users.update(id, dto, user.id);
  }

  /**
   * Delete a user — owner only.
   */
  @Roles('owner')
  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.delete(id, user.id);
  }

  /**
   * Change password — self + owner can change any user's password.
   */
  @Post(':id/change-password')
  changePassword(
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Allow user to change their own password, or owner to change any password
    if (id !== user.id && user.role !== 'owner') {
      throw new ForbiddenException('You can only change your own password');
    }
    return this.users.changePassword(id, dto);
  }
}
