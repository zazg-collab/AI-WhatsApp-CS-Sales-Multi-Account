import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { LeadStage } from '@hermes/database';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { Roles, RolesGuard } from '../../auth/roles';
import { CustomersService } from './customers.service';
import { UpdateCustomerDto, AddNoteDto, BulkCustomerActionDto } from './dto/customers.dto';

// PRD 14.7 — Customers / CRM.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('export')
  async export(
    @Query('stage') stage: LeadStage | undefined,
    @Query('tag') tag: string | undefined,
    @Query('search') search: string | undefined,
    @Res() res: Response,
  ) {
    const items = await this.customers.exportList({ stage, tag, search });
    const header = 'id,name,phone,email,leadStage,leadScore,tags,lastContactAt,notes,createdAt\n';
    const rows = items.map((c) => [
      c.id,
      `"${(c.name ?? '').replace(/"/g, '""')}"`,
      c.phoneNumber,
      '',
      c.leadStage,
      c.leadScore,
      `"${c.tags.join(';')}"`,
      c.lastMessageAt?.toISOString() ?? '',
      `"${(c.notes ?? '').replace(/"/g, '""')}"`,
      c.createdAt.toISOString(),
    ].join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
    res.send(header + rows);
  }

  @Get()
  list(
    @Query('stage') stage?: LeadStage,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
  ) {
    return this.customers.list({ stage, tag, search });
  }

  @Post('bulk')
  @Roles('owner', 'supervisor', 'admin')
  bulkAction(@Body() dto: BulkCustomerActionDto, @CurrentUser() user: AuthUser) {
    return this.customers.bulkAction(dto, user.id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }

  @Patch(':id')
  @Roles('owner', 'supervisor', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  @Post(':id/notes')
  @Roles('owner', 'supervisor', 'admin')
  addNote(
    @Param('id') id: string,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.addNote(id, dto.note, user.id);
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.customers.timeline(id);
  }
}
