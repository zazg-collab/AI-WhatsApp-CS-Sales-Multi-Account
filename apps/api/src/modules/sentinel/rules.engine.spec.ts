import { SentinelDecision, RiskLevel } from '@sentinel/database';
import {
  evaluateRules,
  decisionFromConfidence,
  mostRestrictive,
  highestRisk,
  angkaUtuh, // >>> ANGGA — Fase 113 <<<
  checkKnowledgeGrounding,
} from './rules.engine';

describe('rules.engine', () => {
  describe('evaluateRules', () => {
    it('returns null for clean text', () => {
      expect(evaluateRules('halo kak, mau tanya harga produk')).toBeNull();
    });

    it('flags legal/threat keywords as pause_ai/critical', () => {
      const hit = evaluateRules('saya akan lapor polisi dan tuntut kalian');
      expect(hit).not.toBeNull();
      expect(hit!.decision).toBe(SentinelDecision.pause_ai);
      expect(hit!.riskLevel).toBe(RiskLevel.critical);
    });

    it('flags refund as takeover_required/high', () => {
      const hit = evaluateRules('saya minta refund sekarang');
      expect(hit!.decision).toBe(SentinelDecision.takeover_required);
      expect(hit!.riskLevel).toBe(RiskLevel.high);
    });

    it('matches batalkan as refund rule', () => {
      const hit = evaluateRules('tolong batalkan pesanan saya');
      expect(hit!.decision).toBe(SentinelDecision.takeover_required);
    });

    it('flags complaint keywords as draft/medium', () => {
      const hit = evaluateRules('saya komplain, produknya jelek');
      expect(hit!.decision).toBe(SentinelDecision.draft);
      expect(hit!.riskLevel).toBe(RiskLevel.medium);
    });

    it('most restrictive rule wins when multiple match', () => {
      // contains both complaint (draft) and legal (pause_ai)
      const hit = evaluateRules('saya kecewa dan mau lapor polisi');
      expect(hit!.decision).toBe(SentinelDecision.pause_ai);
    });

    it('is case-insensitive', () => {
      expect(evaluateRules('REFUND please')!.decision).toBe(
        SentinelDecision.takeover_required,
      );
    });
  });

  /**
   * >>> ANGGA — Fase 113 (2026-08-04): `checkPriceGrounding` DIHAPUS dari
   * rules.engine.ts — bukan diganti versi lain di Sentinel. Akar masalahnya
   * (model mengetik angka rupiah sendiri) sekarang dicegah lebih awal, lewat
   * `ShippingService.resolvePriceTokens` (diuji lengkap di
   * shipping.service.spec.ts, dipanggil dari AiService SEBELUM Sentinel
   * review). `angkaUtuh` sendiri TETAP dipakai (diimpor resolvePriceTokens) —
   * tes di bawah menjaga karakteristik inti yang dulu diuji lewat
   * checkPriceGrounding, supaya regresi insiden Fatih (2026-08-03) tetap
   * terjaga: angka diperiksa sebagai UTUH, bukan potongan digit yang nyambung.
   */
  describe('angkaUtuh', () => {
    it('angka berpemisah ribuan & angka polos dikenali sebagai bentuk yang sama', () => {
      expect(angkaUtuh('Rp150.000')).toEqual(new Set(['150000']));
      expect(angkaUtuh('150000')).toEqual(new Set(['150000']));
    });

    it('hanyaHarga: angka pendek tanpa pemisah/Rp diabaikan (kuantitas, bukan harga)', () => {
      expect(angkaUtuh('Garansi sampai 2026, ambil 3 pcs', true)).toEqual(new Set());
    });

    it('hanyaHarga: 4 digit tetap dihitung kalau ditulis dengan Rp', () => {
      expect(angkaUtuh('Ongkirnya Rp9000 kak', true)).toEqual(new Set(['9000']));
    });

    it('dua angka berdampingan tidak pernah "nyambung" jadi angka ketiga', () => {
      // Insiden Fatih 2026-08-03: cara lama menyambung SEMUA digit acuan jadi
      // satu untaian ("150000139000") lalu checkPriceGrounding LAMA memakai
      // includes() — potongan "000139" ikut lolos. angkaUtuh mengambil tiap
      // angka sebagai anggota Set yang UTUH, jadi potongan sambungan begitu
      // tidak pernah jadi anggota yang sah.
      const acuan = angkaUtuh('150000 139000 155000');
      expect(acuan.has('000139')).toBe(false);
      expect(acuan).toEqual(new Set(['150000', '139000', '155000']));
    });
  });

  describe('checkKnowledgeGrounding', () => {
    it('returns null when knowledge/product data was actually retrieved', () => {
      expect(checkKnowledgeGrounding('Tersedia kak', 'Produk A 150000 5', 'ada warna merah?')).toBeNull();
    });

    it('returns null when the bot correctly used the fallback phrase', () => {
      expect(
        checkKnowledgeGrounding('Untuk info tersebut saya bantu konfirmasi dulu ke admin ya kak.', '', 'ada garansi seumur hidup?'),
      ).toBeNull();
    });

    it('returns null for greetings/smalltalk', () => {
      expect(checkKnowledgeGrounding('Halo kak, ada yang bisa dibantu?', '', 'halo')).toBeNull();
    });

    it('flags a substantive question answered with nothing retrieved and no fallback', () => {
      const hit = checkKnowledgeGrounding(
        'Tentu, produk kami bergaransi seumur hidup dan gratis ongkir ke seluruh dunia.',
        '',
        'apakah ada garansi seumur hidup?',
      );
      expect(hit).not.toBeNull();
      expect(hit!.decision).toBe(SentinelDecision.draft);
    });
  });

  describe('decisionFromConfidence', () => {
    it('>=90 approves', () => {
      expect(decisionFromConfidence(90)).toBe(SentinelDecision.approve);
      expect(decisionFromConfidence(100)).toBe(SentinelDecision.approve);
    });
    it('70-89 drafts (supervised)', () => {
      expect(decisionFromConfidence(70)).toBe(SentinelDecision.draft);
      expect(decisionFromConfidence(89)).toBe(SentinelDecision.draft);
    });
    it('50-69 drafts', () => {
      expect(decisionFromConfidence(50)).toBe(SentinelDecision.draft);
      expect(decisionFromConfidence(69)).toBe(SentinelDecision.draft);
    });
    it('<50 blocks', () => {
      expect(decisionFromConfidence(49)).toBe(SentinelDecision.block);
      expect(decisionFromConfidence(0)).toBe(SentinelDecision.block);
    });
  });

  describe('mostRestrictive', () => {
    it('picks higher-rank decision', () => {
      expect(
        mostRestrictive(SentinelDecision.approve, SentinelDecision.pause_ai),
      ).toBe(SentinelDecision.pause_ai);
      expect(
        mostRestrictive(SentinelDecision.block, SentinelDecision.draft),
      ).toBe(SentinelDecision.block);
    });
    it('returns first when equal', () => {
      expect(
        mostRestrictive(SentinelDecision.draft, SentinelDecision.draft),
      ).toBe(SentinelDecision.draft);
    });
  });

  describe('highestRisk', () => {
    it('picks higher risk level', () => {
      expect(highestRisk(RiskLevel.low, RiskLevel.critical)).toBe(
        RiskLevel.critical,
      );
      expect(highestRisk(RiskLevel.high, RiskLevel.medium)).toBe(
        RiskLevel.high,
      );
    });
  });
});
