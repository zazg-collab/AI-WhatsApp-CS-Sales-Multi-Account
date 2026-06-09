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

// PRD 14.2 — WhatsApp accounts. Implementation lands in the gateway iteration.
@UseGuards(JwtAuthGuard)
@Controller('wa/accounts')
export class WaController {
  @Get()
  list() {
    return NotImplemented('wa.accounts.list');
  }

  @Post()
  create() {
    return NotImplemented('wa.accounts.create');
  }

  @Get(':id/qr')
  qr(@Param('id') _id: string) {
    return NotImplemented('wa.accounts.qr');
  }

  @Post(':id/restart')
  restart(@Param('id') _id: string) {
    return NotImplemented('wa.accounts.restart');
  }

  @Patch(':id')
  update(@Param('id') _id: string) {
    return NotImplemented('wa.accounts.update');
  }
}
