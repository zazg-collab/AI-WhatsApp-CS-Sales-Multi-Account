import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { WaService } from './wa.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

// PRD 14.2 — WhatsApp accounts (Baileys gateway).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wa/accounts')
export class WaController {
  constructor(
    private readonly wa: WaService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list() {
    return this.prisma.whatsappAccount.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @Roles('owner', 'supervisor')
  @Post()
  async create(@Body() dto: CreateAccountDto) {
    const account = await this.prisma.whatsappAccount.create({ data: dto });
    await this.wa.startSession(account.id);
    return account;
  }

  @Get(':id/qr')
  qr(@Param('id') id: string) {
    return { qr: this.wa.getQr(id), connected: this.wa.isConnected(id) };
  }

  @Roles('owner', 'supervisor', 'admin')
  @Post(':id/restart')
  async restart(@Param('id') id: string) {
    await this.wa.restart(id);
    return { success: true };
  }

  @Roles('owner', 'supervisor')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.prisma.whatsappAccount.update({
      where: { id },
      data: dto,
    });
  }
}
