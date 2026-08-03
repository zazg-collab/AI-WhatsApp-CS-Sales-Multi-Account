import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles';
import { SettingsService } from '../settings/settings.service';
import { ShippingService } from './shipping.service';
import { ShippingQuoteTestDto } from './dto/shipping.dto';

/**
 * >>> ANGGA — Endpoint uji manual modul Shipping Service Mengantar.
 *
 * Bukan endpoint publik/pelanggan: ini alat admin untuk memeriksa apa yang
 * SEBENARNYA dihitung sistem sebelum jawaban sampai ke pelanggan — pola yang
 * sama seperti kolom uji pertanyaan di menu Knowledge.
 */
@ApiTags('shipping')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shipping')
export class ShippingController {
  constructor(
    private readonly shipping: ShippingService,
    private readonly settings: SettingsService,
  ) {}

  @ApiOperation({ summary: 'Status konfigurasi modul ongkir (tanpa membocorkan kredensial)' })
  @Roles('admin', 'supervisor', 'owner')
  @Get('status')
  async status() {
    const cfg = await this.settings.shipping();
    // Sengaja HANYA boolean: kunci API & origin id tidak pernah dikembalikan.
    return {
      configured: !!cfg.mengantarApiKey && !!cfg.mengantarOriginId,
      apiKeySet: !!cfg.mengantarApiKey,
      originIdSet: !!cfg.mengantarOriginId,
      baseUrl: cfg.baseUrl,
      courierExclude: cfg.courierExclude,
      codAllowlist: cfg.codAllowlist,
      codBlockedRegionKeywords: cfg.codBlockedRegionKeywords,
      defaultWeightGrams: cfg.defaultWeightGrams,
      quoteCacheTtlMs: cfg.quoteCacheTtlMs,
      discountMaxPerOrder: cfg.discountMaxPerOrder,
      priceRoundingIncrement: cfg.priceRoundingIncrement,
      cache: this.shipping.cacheStats(),
    };
  }

  @ApiOperation({ summary: 'Uji hitung ongkir manual (tujuan + daftar barang)' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('test-quote')
  testQuote(@Body() dto: ShippingQuoteTestDto) {
    return this.shipping.quote({
      keyword: dto.keyword,
      items: (dto.items ?? []).map((i) => ({ name: i.name, qty: i.qty ?? 1 })),
    });
  }

  @ApiOperation({ summary: 'Lihat kutipan ongkir yang dihitung untuk satu percakapan' })
  @Roles('admin', 'supervisor', 'owner')
  @Post('conversations/:id/quote')
  quoteForConversation(@Param('id') id: string) {
    return this.shipping.quoteForConversation(id);
  }

  @ApiOperation({ summary: 'Lihat teks grounding ongkir yang disuntik ke prompt' })
  @Roles('admin', 'supervisor', 'owner')
  @Get('conversations/:id/grounding')
  async grounding(@Param('id') id: string) {
    return { text: await this.shipping.getGroundingText(id) };
  }
}
