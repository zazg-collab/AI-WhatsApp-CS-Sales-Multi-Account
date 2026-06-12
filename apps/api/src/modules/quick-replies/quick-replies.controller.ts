import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { QuickRepliesService } from './quick-replies.service';
import { CreateQuickReplyDto, UpdateQuickReplyDto } from './dto/quick-reply.dto';

@ApiTags('quick-replies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quick-replies')
export class QuickRepliesController {
  constructor(private readonly quickReplies: QuickRepliesService) {}

  @ApiOperation({ summary: 'List quick replies (optionally scoped to an account)' })
  @Roles('viewer')
  @Get()
  list(@Query('accountId') accountId?: string) {
    return this.quickReplies.list(accountId);
  }

  @ApiOperation({ summary: 'Create a quick reply template' })
  @Roles('admin', 'supervisor', 'owner')
  @Post()
  create(@Body() dto: CreateQuickReplyDto, @CurrentUser() user: AuthUser) {
    return this.quickReplies.create(dto, user.id);
  }

  @ApiOperation({ summary: 'Update a quick reply template' })
  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateQuickReplyDto) {
    return this.quickReplies.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete a quick reply template' })
  @Roles('admin', 'supervisor', 'owner')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.quickReplies.remove(id);
  }
}
