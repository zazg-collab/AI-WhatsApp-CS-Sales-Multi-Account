import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, PreviewCampaignDto, UpdateCampaignDto } from './dto/campaigns.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.campaigns.list(status);
  }

  @Post('preview')
  @Roles('owner', 'supervisor', 'admin')
  preview(@Body() dto: PreviewCampaignDto) {
    return this.campaigns.preview(dto.whatsappAccountId, dto.targetFilter ?? {});
  }

  @Post()
  @Roles('owner', 'supervisor', 'admin')
  create(@Body() dto: CreateCampaignDto, @CurrentUser() user: AuthUser) {
    return this.campaigns.create(dto, user.id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.campaigns.get(id);
  }

  @Patch(':id')
  @Roles('owner', 'supervisor', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto, @CurrentUser() user: AuthUser) {
    return this.campaigns.update(id, dto, user.id);
  }

  @Post(':id/submit')
  @Roles('owner', 'supervisor', 'admin')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.submit(id, user.id);
  }

  @Post(':id/approve')
  @Roles('owner', 'supervisor')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.approve(id, user.id);
  }

  @Post(':id/start')
  @Roles('owner', 'supervisor')
  start(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.start(id, user.id);
  }

  @Post(':id/pause')
  @Roles('owner', 'supervisor')
  pause(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.pause(id, user.id);
  }

  @Post(':id/cancel')
  @Roles('owner', 'supervisor')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.cancel(id, user.id);
  }

  @Post(':id/retry-failed')
  @Roles('owner', 'supervisor')
  retryFailed(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.retryFailed(id, user.id);
  }
}
