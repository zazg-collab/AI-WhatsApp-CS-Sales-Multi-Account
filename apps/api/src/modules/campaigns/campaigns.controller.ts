import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, OptOutDto, PreviewCampaignDto, UpdateCampaignDto } from './dto/campaigns.dto';

@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @ApiOperation({ summary: 'List campaigns with optional status filter' })
  @Roles('viewer')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.campaigns.list(status, user);
  }

  @ApiOperation({ summary: 'Preview campaign recipients before sending' })
  @Post('preview')
  @Roles('owner', 'supervisor', 'admin')
  preview(@Body() dto: PreviewCampaignDto, @CurrentUser() user: AuthUser) {
    return this.campaigns.preview(dto.whatsappAccountId, dto.targetFilter ?? {}, user);
  }

  @ApiOperation({ summary: 'Create a new campaign draft' })
  @Post()
  @Roles('owner', 'supervisor', 'admin')
  create(@Body() dto: CreateCampaignDto, @CurrentUser() user: AuthUser) {
    return this.campaigns.create(dto, user.id, user);
  }

  @ApiOperation({ summary: 'Get a campaign by ID' })
  @Roles('viewer')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.get(id, user);
  }

  @ApiOperation({ summary: 'Update a campaign' })
  @Patch(':id')
  @Roles('owner', 'supervisor', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto, @CurrentUser() user: AuthUser) {
    return this.campaigns.update(id, dto, user.id, user);
  }

  @ApiOperation({ summary: 'Submit campaign for approval' })
  @Post(':id/submit')
  @Roles('owner', 'supervisor', 'admin')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.submit(id, user.id, user);
  }

  @ApiOperation({ summary: 'Approve a campaign (owner/supervisor)' })
  @Post(':id/approve')
  @Roles('owner', 'supervisor')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.approve(id, user.id);
  }

  @ApiOperation({ summary: 'Start sending an approved campaign' })
  @Post(':id/start')
  @Roles('owner', 'supervisor')
  start(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.start(id, user.id);
  }

  @ApiOperation({ summary: 'Pause a running campaign' })
  @Post(':id/pause')
  @Roles('owner', 'supervisor')
  pause(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.pause(id, user.id);
  }

  @ApiOperation({ summary: 'Cancel a campaign' })
  @Post(':id/cancel')
  @Roles('owner', 'supervisor')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.cancel(id, user.id);
  }

  @ApiOperation({ summary: 'Retry failed campaign messages' })
  @Post(':id/retry-failed')
  @Roles('owner', 'supervisor')
  retryFailed(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.retryFailed(id, user.id);
  }

  @ApiOperation({ summary: 'Duplicate a campaign as a new draft' })
  @Post(':id/duplicate')
  @Roles('owner', 'supervisor', 'admin')
  duplicate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.duplicate(id, user.id, user);
  }

  @ApiOperation({ summary: 'Manually mark a customer as opted out of campaigns' })
  @Post('opt-out')
  @Roles('owner', 'supervisor', 'admin')
  optOut(@Body() dto: OptOutDto, @CurrentUser() user: AuthUser) {
    return this.campaigns.optOut(dto.customerId, user.id, user);
  }

  @ApiOperation({ summary: 'Reverse a customer opt-out' })
  @Post('opt-in')
  @Roles('owner', 'supervisor', 'admin')
  optIn(@Body() dto: OptOutDto, @CurrentUser() user: AuthUser) {
    return this.campaigns.optIn(dto.customerId, user.id, user);
  }

  @ApiOperation({ summary: 'List opted-out customers (paginated)' })
  @Get('opted-out/list')
  @Roles('owner', 'supervisor', 'admin')
  optedOut(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.campaigns.listOptedOut(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 50,
    );
  }
}
