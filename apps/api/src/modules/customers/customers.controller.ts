import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LeadStage } from '@hermes/database';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CustomersService } from './customers.service';
import { UpdateCustomerDto, AddNoteDto } from './dto/customers.dto';

// PRD 14.7 — Customers / CRM.
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @Query('stage') stage?: LeadStage,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
  ) {
    return this.customers.list({ stage, tag, search });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() dto: AddNoteDto) {
    return this.customers.addNote(id, dto.note);
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.customers.timeline(id);
  }
}
