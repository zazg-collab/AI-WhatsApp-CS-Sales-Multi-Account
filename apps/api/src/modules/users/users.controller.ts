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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @ApiOperation({ summary: 'List users (owner/supervisor only)' })
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

  @ApiOperation({ summary: 'Active admins ranked by open-conversation load (for least-busy assignment)' })
  @Roles('viewer')
  @Get('workload')
  workload() {
    return this.users.workload();
  }

  @ApiOperation({ summary: 'Create a new user (owner only)' })
  @Roles('owner')
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.create(dto, user.id);
  }

  @ApiOperation({ summary: 'Get a user by ID (self or owner/supervisor)' })
  @Roles('viewer')
  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // Allow user to fetch their own details, or owner/supervisor to fetch any user
    if (id !== user.id && user.role !== 'owner' && user.role !== 'supervisor') {
      throw new ForbiddenException('You do not have permission to view this user');
    }
    return this.users.get(id);
  }

  @ApiOperation({ summary: 'Update a user (self or owner)' })
  @Roles('viewer')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Allow self-update for non-role fields, or owner to update any field.
    if (id !== user.id && user.role !== 'owner') {
      throw new ForbiddenException('You can only update your own profile');
    }
    if (id === user.id && user.role !== 'owner' && dto.role) {
      throw new ForbiddenException('You cannot update your own role');
    }
    return this.users.update(id, dto, user.id);
  }

  @ApiOperation({ summary: 'Delete a user (owner only)' })
  @Roles('owner')
  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.delete(id, user.id);
  }

  @ApiOperation({ summary: 'Change password (self or owner)' })
  @Roles('viewer')
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
