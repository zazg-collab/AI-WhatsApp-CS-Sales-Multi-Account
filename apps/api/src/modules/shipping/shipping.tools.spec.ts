import { readFileSync } from 'fs';
import { join } from 'path';
import { shippingTools, SHIPPING_TOOL_NAMES } from './shipping.tools';

/**
 * >>> ANGGA — F1 gelombang v2 (2026-08-09, cowork). Tiga hal yang dijaga:
 *  T3 — `province` WAJIB. Skema lama di berkas ini tidak punya `province`;
 *       kalau sempat diwiring, `isRegionCodBlocked('')` mengembalikan false dan
 *       blokir COD Papua/Maluku/Sultra bocor TANPA error dan TANPA test merah.
 *  F1 — `items` OPSIONAL (jalur `shippingOnly`: pelanggan tanya ongkir sebelum
 *       memilih barang). Konsekuensinya executor wajib mem-default ke `[]`.
 *  T2 — satu sumber. Skema tidak boleh ditulis inline lagi di pemakainya. <<<
 */
describe('shipping.tools — satu sumber skema tool ongkir', () => {
  const fn = (nama: string) => {
    const t = shippingTools.find((x) => x.function.name === nama);
    if (!t) throw new Error(`tool ${nama} tidak ada`);
    return t.function as { name: string; description: string; parameters: any };
  };

  it('menyediakan tepat dua tool ongkir', () => {
    expect(SHIPPING_TOOL_NAMES).toEqual(['search_destinations', 'calculate_shipping']);
  });

  // ── T3 ────────────────────────────────────────────────────────────────────
  it('T3: calculate_shipping MEWAJIBKAN province — tanpa itu blokir COD wilayah bocor', () => {
    const p = fn('calculate_shipping').parameters;
    expect(p.required).toContain('province');
    expect(p.properties.province.type).toBe('string');
  });

  it('T3: calculate_shipping mewajibkan seluruh identitas destinasi dari search_destinations', () => {
    expect(fn('calculate_shipping').parameters.required).toEqual(
      expect.arrayContaining(['destination_id', 'city', 'province', 'label']),
    );
  });

  it('T3: skema lama yang ditinggalkan TIDAK boleh hidup lagi (total_weight_grams/subtotal)', () => {
    const props = Object.keys(fn('calculate_shipping').parameters.properties);
    expect(props).not.toContain('total_weight_grams');
    expect(props).not.toContain('subtotal');
  });

  // ── items opsional ────────────────────────────────────────────────────────
  it('items TIDAK wajib — pelanggan boleh tanya ongkir sebelum memilih barang', () => {
    const p = fn('calculate_shipping').parameters;
    expect(p.properties.items.type).toBe('array');
    expect(p.required).not.toContain('items');
  });

  // ── T2: tidak ada salinan inline yang tertinggal ──────────────────────────
  it('T2: pemakainya meng-import skema, tidak mendefinisikannya inline', () => {
    const src = join(__dirname, '..', '..');
    for (const rel of ['modules/ai/ai.service.ts', 'test-harness/chat-session.manager.ts']) {
      const isi = readFileSync(join(src, rel), 'utf8');
      expect(isi).toContain("from '");
      expect(isi).toContain('shippingTools');
      // penanda definisi inline: nama tool ditulis sebagai properti skema
      expect(isi).not.toContain("name: 'search_destinations'");
      expect(isi).not.toContain("name: 'calculate_shipping'");
      // >>> ANGGA — F3: tool knowledge ikut disatukan. Sebelumnya dobel DAN
      // isinya BERBEDA antara produksi & tester (temuan audit F1). <<<
      expect(isi).not.toContain("name: 'search_knowledge'");
      expect(isi).toContain('searchKnowledgeTool');
    }
  });

  it('T2: tool knowledge juga satu sumber, dan identik untuk produksi & tester', () => {
    const src = join(__dirname, '..', '..');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { searchKnowledgeTool, KNOWLEDGE_TOOL_NAME } = require('../knowledge/knowledge.tools');
    expect(KNOWLEDGE_TOOL_NAME).toBe('search_knowledge');
    expect(searchKnowledgeTool.function.parameters.required).toEqual(['query']);
    for (const rel of ['modules/ai/ai.service.ts', 'test-harness/chat-session.manager.ts']) {
      expect(readFileSync(join(src, rel), 'utf8')).toContain('tools.push(searchKnowledgeTool)');
    }
  });

  it('deskripsi tool memuat perintah keras yang menyetir perilaku model', () => {
    expect(fn('search_destinations').description).toMatch(/WAJIB DIPANGGIL/i);
    expect(fn('calculate_shipping').description).toMatch(/JANGAN PERNAH MENGHITUNG ONGKIR SENDIRI/i);
  });
});
