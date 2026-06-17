import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { WaService } from './wa.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactSyncService } from './contact-sync.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { logAudit } from '../../common/audit.util';

// PRD 14.2 — WhatsApp accounts (Baileys gateway).
@ApiTags('whatsapp-accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wa/accounts')
export class WaController {
  constructor(
    private readonly wa: WaService,
    private readonly prisma: PrismaService,
    private readonly contacts: ContactSyncService,
  ) {}

  @ApiOperation({ summary: 'List all WhatsApp accounts' })
  @Roles('viewer')
  @Get()
  list() {
    return this.prisma.whatsappAccount.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @ApiOperation({ summary: 'Add a new WhatsApp account and start session' })
  @Roles('owner', 'supervisor')
  @Post()
  async create(@Body() dto: CreateAccountDto, @CurrentUser() user: AuthUser) {
    const account = await this.prisma.whatsappAccount.create({ data: dto });
    await this.wa.startSession(account.id);
    await logAudit(this.prisma, {
      userId: user.id,
      action: 'account_create',
      entityType: 'whatsapp_account',
      entityId: account.id,
      newValue: { accountName: account.accountName, phoneNumber: account.phoneNumber },
    });
    return account;
  }

  @ApiOperation({ summary: 'Get QR code for a WhatsApp account' })
  @Roles('viewer')
  @Get(':id/qr')
  qr(@Param('id') id: string) {
    return { qr: this.wa.getQr(id), connected: this.wa.isConnected(id) };
  }

  @ApiOperation({ summary: 'Get live connection health for an account' })
  // Without an explicit @Roles, the default-deny RolesGuard 403'd this for
  // everyone — the endpoint was dead since it shipped.
  @Roles('viewer')
  @Get(':id/health')
  async health(@Param('id') id: string) {
    const account = await this.prisma.whatsappAccount.findUnique({
      where: { id },
    });
    const { liveSocket, reconnectAttempts } = this.wa.getHealth(id);
    return {
      accountId: id,
      dbStatus: account?.sessionStatus ?? null,
      liveSocket,
      reconnectAttempts,
    };
  }

  @ApiOperation({ summary: 'List synced WhatsApp contact book entries' })
  @Roles('viewer')
  @Get(':id/contacts')
  contactsForAccount(
    @Param('id') id: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contacts.list({
      accountId: id,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @ApiOperation({ summary: 'Request a phone-linking pairing code for a WhatsApp account' })
  @Roles('owner', 'supervisor', 'admin')
  @Post(':id/request-pairing-code')
  async requestPairingCode(@Param('id') id: string) {
    const code = await this.wa.requestPairingCode(id);
    return { code };
  }

  @ApiOperation({ summary: 'Restart a WhatsApp session' })
  @Roles('owner', 'supervisor', 'admin')
  @Post(':id/restart')
  async restart(@Param('id') id: string) {
    await this.wa.restart(id);
    return { success: true };
  }

  @ApiOperation({ summary: 'Delete a WhatsApp account and clean up its session' })
  @Roles('owner', 'supervisor')
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const account = await this.prisma.whatsappAccount.findUnique({ where: { id } });
    if (!account) return { success: true };
    await logAudit(this.prisma, {
      userId: user.id,
      action: 'account_delete',
      entityType: 'whatsapp_account',
      entityId: id,
      oldValue: { accountName: account.accountName, phoneNumber: account.phoneNumber },
    });
    await this.wa.removeAccount(id);
    return { success: true };
  }

  @ApiOperation({ summary: 'Update a WhatsApp account' })
  @Roles('owner', 'supervisor')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() user: AuthUser,
  ) {
    const account = await this.prisma.whatsappAccount.update({
      where: { id },
      data: dto,
    });
    await logAudit(this.prisma, {
      userId: user.id,
      action: 'account_update',
      entityType: 'whatsapp_account',
      entityId: id,
      newValue: dto as Record<string, unknown>,
    });
    return account;
  }
}
