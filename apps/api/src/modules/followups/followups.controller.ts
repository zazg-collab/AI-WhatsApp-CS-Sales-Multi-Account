import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { FollowUpsService } from './followups.service';
import { CreateFollowUpDto } from './dto/create-followup.dto';

@ApiTags('follow-ups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('follow-ups')
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @ApiOperation({ summary: 'Schedule a follow-up for a conversation' })
  @Roles('admin', 'supervisor', 'owner')
  @Post()
  schedule(@Body() dto: CreateFollowUpDto, @CurrentUser() user: AuthUser) {
    return this.followUpsService.schedule(dto, user);
  }

  @ApiOperation({ summary: 'List follow-ups for a conversation' })
  @Roles('viewer')
  @Get()
  list(@Query('conversationId') conversationId: string, @CurrentUser() user: AuthUser) {
    return this.followUpsService.list(conversationId, user);
  }

  @ApiOperation({ summary: 'Cancel a follow-up' })
  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.followUpsService.cancel(id, user);
  }
}
