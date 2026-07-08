import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUrl, ArrayMaxSize } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { WebhooksService, WEBHOOK_EVENTS } from './webhooks.service';

class CreateWebhookDto {
  @IsUrl({ require_tld: false }) url!: string;
  @IsString() secret!: string;
  @IsArray() @ArrayMaxSize(10) @IsIn(WEBHOOK_EVENTS, { each: true }) events!: string[];
}

class UpdateWebhookDto {
  @IsOptional() @IsUrl({ require_tld: false }) url?: string;
  @IsOptional() @IsString() secret?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsIn(WEBHOOK_EVENTS, { each: true }) events?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  @ApiOperation({ summary: 'List available event types' })
  @Roles('owner', 'supervisor')
  @Get('events')
  events() { return WEBHOOK_EVENTS; }

  @ApiOperation({ summary: 'List webhook endpoints' })
  @Roles('owner', 'supervisor')
  @Get()
  list() { return this.svc.list(); }

  @ApiOperation({ summary: 'Create webhook endpoint' })
  @Roles('owner')
  @Post()
  create(@Body() dto: CreateWebhookDto) { return this.svc.create(dto.url, dto.secret, dto.events); }

  @ApiOperation({ summary: 'Update webhook endpoint' })
  @Roles('owner')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWebhookDto) { return this.svc.update(id, dto); }

  @ApiOperation({ summary: 'Delete webhook endpoint' })
  @Roles('owner')
  @Delete(':id')
  delete(@Param('id') id: string) { return this.svc.delete(id); }
}
