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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { UpdateCustomerDto, AddNoteDto, BulkCustomerActionDto } from './dto/customers.dto';
import { csvRow } from '../../common/csv.util';

// PRD 14.7 — Customers / CRM.
@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @ApiOperation({ summary: 'Export customers as CSV' })
  @Roles('viewer')
  @Get('export')
  async export(
    @Query('stage') stage: LeadStage | undefined,
    @Query('tag') tag: string | undefined,
    @Query('search') search: string | undefined,
    @Res() res: Response,
  ) {
    const items = await this.customers.exportList({ stage, tag, search });
    const header = 'id,name,phone,email,leadStage,leadScore,tags,lastContactAt,notes,createdAt\n';
    const rows = items.map((c) => csvRow([
      c.id,
      c.name ?? '',
      c.phoneNumber,
      '',
      c.leadStage,
      c.leadScore,
      c.tags.join(';'),
      c.lastMessageAt?.toISOString() ?? '',
      c.notes ?? '',
      c.createdAt.toISOString(),
    ])).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
    res.send(header + rows);
  }

  @ApiOperation({ summary: 'List customers with optional filters' })
  @Roles('viewer')
  @Get()
  list(
    @Query('stage') stage?: LeadStage,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
  ) {
    return this.customers.list({ stage, tag, search });
  }

  @ApiOperation({ summary: 'Bulk CRM actions on customers' })
  @Post('bulk')
  @Roles('owner', 'supervisor', 'admin')
  bulkAction(@Body() dto: BulkCustomerActionDto, @CurrentUser() user: AuthUser) {
    return this.customers.bulkAction(dto, user.id);
  }

  @ApiOperation({ summary: 'Get a customer by ID' })
  @Roles('viewer')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }

  @ApiOperation({ summary: 'Update a customer' })
  @Patch(':id')
  @Roles('owner', 'supervisor', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  @ApiOperation({ summary: 'Add an internal note to a customer' })
  @Post(':id/notes')
  @Roles('owner', 'supervisor', 'admin')
  addNote(
    @Param('id') id: string,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customers.addNote(id, dto.note, user.id);
  }

  @ApiOperation({ summary: 'Block a customer at WhatsApp level (syncs optedOut)' })
  @Post(':id/block')
  @Roles('owner', 'supervisor', 'admin')
  blockContact(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.customers.blockContact(id, user.id);
  }

  @ApiOperation({ summary: 'Unblock a previously blocked customer at WhatsApp level' })
  @Post(':id/unblock')
  @Roles('owner', 'supervisor', 'admin')
  unblockContact(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.customers.unblockContact(id, user.id);
  }

  @ApiOperation({ summary: 'Get unified timeline for a customer' })
  @Roles('viewer')
  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.customers.timeline(id);
  }
}
