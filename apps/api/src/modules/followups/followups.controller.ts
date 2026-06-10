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
  schedule(@Body() dto: CreateFollowUpDto) {
    return this.followUpsService.schedule(dto);
  }

  @ApiOperation({ summary: 'List follow-ups for a conversation' })
  @Get()
  list(@Query('conversationId') conversationId: string) {
    return this.followUpsService.list(conversationId);
  }

  @ApiOperation({ summary: 'Cancel a follow-up' })
  @Roles('admin', 'supervisor', 'owner')
  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.followUpsService.cancel(id);
  }
}
