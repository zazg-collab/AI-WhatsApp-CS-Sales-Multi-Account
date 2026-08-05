import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { logAudit } from '../../common/audit.util';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { AppSettings } from './settings.types';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Never return the raw API key — only whether one is configured. */
  private mask(all: AppSettings) {
    const { apiKey, ...ai } = all.ai;
    // >>> ANGGA: kredensial Mengantar diperlakukan sama seperti AI_API_KEY —
    // tidak pernah dikembalikan mentah ke dashboard, cuma status "sudah diisi".
    const { mengantarApiKey, ...shipping } = all.shipping;
    return {
      ...all,
      ai: { ...ai, apiKeySet: !!apiKey },
      shipping: { ...shipping, mengantarApiKeySet: !!mengantarApiKey },
    };
    // <<< ANGGA
  }

  @ApiOperation({ summary: 'Get application settings (secrets masked)' })
  @Roles('owner', 'supervisor')
  @Get()
  async get() {
    return this.mask(await this.settings.getAll());
  }

  @ApiOperation({ summary: 'Update application settings' })
  @Roles('owner')
  @Put()
  async update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: AuthUser) {
    if (dto.ai) {
      const ai = { ...dto.ai };
      // An empty/omitted apiKey means "keep the current secret" — do not wipe it.
      if (!ai.apiKey || !ai.apiKey.trim()) delete ai.apiKey;
      if (Object.keys(ai).length) await this.settings.updateCategory('ai', ai);
    }
    if (dto.wa) await this.settings.updateCategory('wa', dto.wa);
    if (dto.notifications) await this.settings.updateCategory('notifications', dto.notifications);
    if (dto.sla) await this.settings.updateCategory('sla', dto.sla);
    if (dto.sentinel) await this.settings.updateCategory('sentinel', dto.sentinel);
    if (dto.campaign) await this.settings.updateCategory('campaign', dto.campaign);
    // >>> ANGGA: kunci API kosong = "pertahankan yang tersimpan", sama seperti ai.apiKey.
    if (dto.shipping) {
      const shipping = { ...dto.shipping };
      if (!shipping.mengantarApiKey || !shipping.mengantarApiKey.trim()) delete shipping.mengantarApiKey;
      if (Object.keys(shipping).length) await this.settings.updateCategory('shipping', shipping);
    }
    // <<< ANGGA
    // >>> ANGGA — addendum v2 M5: kategori memori order tersendiri.
    if (dto.orderContext) await this.settings.updateCategory('orderContext', dto.orderContext);
    // <<< ANGGA

    await logAudit(this.prisma, {
      userId: user.id,
      action: 'settings_update',
      entityType: 'app_settings',
      // Record which categories changed, but never the secret value itself.
      newValue: {
        categories: Object.keys(dto),
        aiApiKeyChanged: !!(dto.ai?.apiKey && dto.ai.apiKey.trim()),
        mengantarApiKeyChanged: !!(dto.shipping?.mengantarApiKey && dto.shipping.mengantarApiKey.trim()), // >>> ANGGA <<<
      },
    });

    return this.mask(await this.settings.getAll());
  }
}
