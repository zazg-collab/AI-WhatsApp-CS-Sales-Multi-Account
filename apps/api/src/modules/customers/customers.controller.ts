import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { NotImplemented } from '../../common/not-implemented';

// PRD 14.7 — Customers / CRM.
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  @Get()
  list() {
    return NotImplemented('customers.list');
  }

  @Get(':id')
  get(@Param('id') _id: string) {
    return NotImplemented('customers.get');
  }

  @Patch(':id')
  update(@Param('id') _id: string) {
    return NotImplemented('customers.update');
  }

  @Post(':id/notes')
  addNote(@Param('id') _id: string) {
    return NotImplemented('customers.addNote');
  }

  @Get(':id/timeline')
  timeline(@Param('id') _id: string) {
    return NotImplemented('customers.timeline');
  }
}
