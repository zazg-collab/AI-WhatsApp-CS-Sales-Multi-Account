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
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { FollowUpsService } from './followups.service';
import { CreateFollowUpDto } from './dto/create-followup.dto';

@UseGuards(JwtAuthGuard)
@Controller('follow-ups')
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @Post()
  schedule(@Body() dto: CreateFollowUpDto) {
    return this.followUpsService.schedule(dto);
  }

  @Get()
  list(@Query('conversationId') conversationId: string) {
    return this.followUpsService.list(conversationId);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.followUpsService.cancel(id);
  }
}
