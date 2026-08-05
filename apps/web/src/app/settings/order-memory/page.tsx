'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Cpu,
  FloppyDisk,
  Package,
  Brain,
  ShieldWarning,
} from '@/components/ui/core-essential-icons';
import { api } from '@/lib/api';
import { useHasRole } from '@/lib/use-has-role';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useT, type Dict } from '@/lib/i18n';
import { parseList, parseAliases, formatAliases } from '../shipping/shipping.utils';

/**
 * >>> ANGGA — addendum v2 M5 (2026-08-05, ketok Bossfren): Memori Order
 * percakapan adalah urusan PERCAKAPAN, bukan urusan kurir — halaman sendiri,
 * kategori AppSetting sendiri (`orderContext`), tombol simpan sendiri.
 * Payload PUT hanya `{ orderContext: {...} }` — tidak pernah menyentuh
 * kredensial Mengantar/aturan kurir.
 */

const dict: Dict = {
  title: { id: 'Pengaturan', en: 'Settings' },
  subtitle: {
    id: 'Memori order percakapan: log barang/qty/tujuan, penawaran, token global, dan kebijakan nego',
    en: 'Conversation order memory: item/qty/destination log, offers, global tokens, and nego policy',
  },
  tabGeneral: { id: 'Pengaturan umum', en: 'General settings' },
  tabShipping: { id: 'Ongkir (Mengantar)', en: 'Shipping (Mengantar)' },
  tabOrderMemory: { id: 'Memori Order', en: 'Order Memory' },
  readOnly: {
    id: 'Hanya owner yang dapat mengubah pengaturan. Anda melihat dalam mode baca.',
    en: 'Only owners can change settings. You are viewing in read-only mode.',
  },
  loadError: { id: 'Gagal memuat pengaturan dari API.', en: 'Failed to load settings from the API.' },
  saveError: { id: 'Gagal menyimpan pengaturan.', en: 'Failed to save settings.' },
  saved: { id: 'Tersimpan.', en: 'Saved.' },
  save: { id: 'Simpan perubahan', en: 'Save changes' },
  saving: { id: 'Menyimpan…', en: 'Saving…' },
  listHint: { id: 'Dipisah koma.', en: 'Comma-separated.' },

  secCore: { id: 'Memori order', en: 'Order memory' },
  secCoreIntro: {
    id: 'Bot mengingat barang/qty/tujuan yang sedang dibahas per percakapan. Semua kebijakan di bawah dibaca sistem secara deterministik — bukan tebakan model.',
    en: 'The bot remembers the items/qty/destination under discussion per conversation. Every policy below is read deterministically by the system.',
  },
  stale: { id: 'Umur segar entri log (jam)', en: 'Log entry freshness (hours)' },
  staleHint: {
    id: 'Lebih tua dari ini, entri tidak dipakai menjawab angka — hanya untuk menyusun pertanyaan konfirmasi.',
    en: 'Older entries never answer figures — only phrase a confirmation question.',
  },
  bridge: { id: 'Enforcement bridge-validasi', en: 'Bridge-validation enforcement' },
  bridgeHint: {
    id: 'Jawaban dari ASUMSI order wajib menyebut nama barang. retry_once: draft pelanggar dikoreksi otomatis sekali, gagal → ditahan.',
    en: 'Assumption-based answers must name the item. retry_once: violating drafts auto-corrected once, else held.',
  },
  bridgeRetry: { id: 'retry_once — koreksi otomatis lalu tahan (disarankan)', en: 'retry_once — auto-correct then hold (recommended)' },
  bridgePrompt: { id: 'prompt_only — instruksi saja', en: 'prompt_only — instruction only' },
  // >>> ANGGA — F1/F2 (2026-08-05): kata tanya-uang.
  moneyAskKw: { id: 'Kata tanya-uang (pembuka memori)', en: 'Money-ask words (memory opener)' },
  moneyAskKwHint: {
    id: 'Bot hanya menjawab pakai memori order (rekap/asumsi) kalau pesan memuat salah satu kata ini. Sapaan tanpa kata ini dijawab natural tanpa rekap. Kata dasar cukup — "totalnya" tertangkap oleh "total".',
    en: 'Order memory (recap/assumption) only answers when the message contains one of these. Word stems suffice — "totalnya" is caught by "total".',
  },
  // <<< ANGGA
  cancelKw: { id: 'Kata pembatalan order utuh', en: 'Whole-order cancel words' },
  cancelKwHint: {
    id: 'Berlaku hanya kalau seluruh pesan cuma kata ini + pengisi. Pembatalan parsial = perubahan order biasa.',
    en: 'Applies only when the whole message is these words + fillers.',
  },
  aggregateKw: { id: 'Kata makna gabungan', en: 'Aggregate-intent words' },
  aggregateKwHint: {
    id: '"total semuanya" → jumlah SEMUA order segar, daftar barangnya dibacakan.',
    en: '"total for everything" → sum ALL fresh entries, list read back.',
  },
  affirmKw: { id: 'Kata afirmasi pilihan barang', en: 'Item-choice affirmation words' },
  affirmKwHint: {
    id: 'Dihitung hanya bila SELURUH pesan terdiri dari kata ini + pengisi, dan bot sedang menawarkan pilihan.',
    en: 'Counted only when the WHOLE message is these words + fillers and a choice is pending.',
  },
  negationKw: { id: 'Kata negasi', en: 'Negation words' },
  negationKwHint: { id: 'Membatalkan afirmasi.', en: 'Cancels an affirmation.' },
  fillerKw: { id: 'Kata pengisi netral', en: 'Neutral filler words' },
  fillerKwHint: { id: 'Diabaikan pencocok whole-message.', en: 'Ignored by the whole-message matcher.' },

  secOffer: { id: 'Penawaran & kata tunjuk (addendum v2)', en: 'Offers & deixis (addendum v2)' },
  secOfferIntro: {
    id: 'Produk yang disodorkan bot/CS (teks, media, form) tercatat sebagai PENAWARAN — jangkar untuk "yg ini / yg itu".',
    en: 'Products offered by the bot/CS (text, media, form) are recorded as OFFERS — anchors for "this one / that one".',
  },
  deixisKw: { id: 'Frasa tunjuk', en: 'Deixis phrases' },
  deixisKwHint: {
    id: '"yg ini", "yg itu" → resolve ke penawaran terakhir; 2+ penawaran → bot bertanya tertutup.',
    en: '"this one", "that one" → resolve to the latest offer; 2+ offers → closed question.',
  },
  offerWindow: { id: 'Jendela penawaran (menit)', en: 'Offer window (minutes)' },
  offerWindowHint: {
    id: 'Umur maksimum penawaran untuk resolusi kata tunjuk & fallback konteks.',
    en: 'Max offer age for deixis resolution & context fallback.',
  },
  formKw: { id: 'Frasa penanda pesan form', en: 'Form-message hint phrases' },
  formKwHint: {
    id: 'Pesan yang memuat frasa ini (template funnel) di-seed deterministik ke penawaran — tanpa LLM.',
    en: 'Messages containing these (funnel templates) are seeded deterministically as offers — no LLM.',
  },
  referenceKw: { id: 'Frasa referensi order lama', en: 'Past-order reference phrases' },
  referenceKwHint: {
    id: '"sama yang tadi" → boleh menjangkau 1 order SELESAI terakhir; dihitung ulang + wajib menyebut daftar barangnya.',
    en: '"same as before" → may reach the last COMPLETED order; recomputed + list read back.',
  },

  secTokens: { id: 'Token global (teks verbatim sistem)', en: 'Global tokens (verbatim system text)' },
  secTokensIntro: {
    id: 'Teks yang harus persis & aman (nomor rekening, S&K) tidak pernah diketik model — model menaruh penanda {{nama_token}}, sistem menempel isinya verbatim. Tambah baris baru kapan pun tanpa deploy.',
    en: 'Text that must be exact & safe (bank accounts, T&C) is never typed by the model — it places {{token}}, the system pastes the content verbatim.',
  },
  globalTokens: { id: 'Kamus token global', en: 'Global token dictionary' },
  globalTokensHint: {
    id: 'Satu baris per token: nama_token = isi. Nama wajib huruf kecil/underscore (mis. rekening_transfer). Nama yang bentrok token harga diabaikan.',
    en: 'One line per token: token_name = content. Lowercase/underscore names only (e.g. rekening_transfer).',
  },
  closingNote: { id: 'Catatan penutup order — {{catatan_sk}}', en: 'Order closing note — {{catatan_sk}}' },
  closingNoteHint: {
    id: 'S&K COD & pemesanan. Terkirimnya pesan berisi teks ini = order dianggap SELESAI dan memori mulai bersih. Kosong = penutupan otomatis mati (fallback: resolve percakapan).',
    en: 'COD & ordering T&C. Sending a message containing it marks the order COMPLETED. Empty = auto-closing off.',
  },

  secNego: { id: 'Nego (addendum v2)', en: 'Negotiation (addendum v2)' },
  secNegoIntro: {
    id: 'Nego pertama → bot menawarkan potongan yang DIHITUNG SISTEM (diskon barang/pcs + diskon ongkir, plafon di menu Ongkir). Nego melewati plafon → bot bilang cek atasan + notifikasi instan ke admin. Bot tidak pernah mengarang angka diskon.',
    en: 'First nego → the bot offers SYSTEM-computed discounts (caps in the Shipping menu). Beyond policy → "let me check with my supervisor" + instant admin notification.',
  },
  negoKw: { id: 'Frasa nego', en: 'Nego phrases' },
  negoKwHint: { id: 'Pemicu tangga nego.', en: 'Triggers the nego ladder.' },
  // >>> ANGGA — E1 (2026-08-05): template sambutan form.
  formWelcome: { id: 'Template sambutan pesan form', en: 'Form-message welcome template' },
  formWelcomeHint: {
    id: 'Dibalas PERSIS seperti ini (dirender sistem, bukan AI) saat pesan form funnel terdeteksi — sekali per percakapan, ikut mode AI (draft/kirim). Placeholder: {{nama_form}} (dari "atas nama X"/profil WA), {{produk_form}} (produk katalog yang cocok), {{harga_form}} (harga katalog). Kosong = fitur mati.',
    en: 'Sent VERBATIM (system-rendered, not AI) when a funnel form message is detected — once per conversation, follows AI mode. Placeholders: {{nama_form}}, {{produk_form}}, {{harga_form}}. Empty = off.',
  },
  // >>> ANGGA — E3 (2026-08-05): blacklist frasa internal.
  metaBlacklist: { id: 'Frasa internal terlarang di balasan', en: 'Internal phrases banned in replies' },
  metaBlacklistHint: {
    id: 'Balasan bot yang memuat frasa ini ditahan gerbang uang (bot menyebut "sistem/penanda" ke pelanggan). Tambah dari telemetri di bawah bila ada bocor baru.',
    en: 'Bot replies containing these phrases are held by the money gate (internal talk leaking to customers).',
  },
  // >>> ANGGA — P2 (2026-08-05): frasa penyangkalan data.
  contradictionKw: { id: 'Frasa penyangkalan data (kontradiksi)', en: 'Data-denial phrases (contradiction)' },
  contradictionKwHint: {
    id: 'Ditahan HANYA saat kutipan ongkir sudah dihitung DAN pelanggan memang bertanya uang/tempat — bot dilarang bilang "belum punya info / cek dengan tim" padahal datanya sudah ada.',
    en: 'Held ONLY when a quote is computed AND the turn is about money/places — the bot must not deny data it already has.',
  },
  // <<< ANGGA
  // >>> ANGGA — Q-Chain (2026-08-05, ketok Bossfren): funnel pertanyaan berantai.
  secFunnel: { id: 'Funnel pertanyaan berantai (Q-Chain)', en: 'Chained question funnel (Q-Chain)' },
  secFunnelIntro: {
    id: 'WAJIB & ditegakkan sistem: setiap jawaban uang ditutup pertanyaan langkah berikutnya — Barang → Alamat (ongkir saja) → Konklusi keranjang (produk >1) → Qty → Total + Metode. Kalimat dibacakan PERSIS seperti template; draft yang melanggar ditahan gerbang. Kosongkan satu template untuk mematikan langkah itu. Maks 2x tanya per langkah per order.',
    en: 'ENFORCED: every money answer ends with the next funnel question. Templates are read VERBATIM; violating drafts are held. Empty template = step off. Max 2 asks per step per order.',
  },
  funnelEnabled: { id: 'Aktifkan funnel', en: 'Enable funnel' },
  funnelAskItem: { id: 'Tanya produk (langkah 0)', en: 'Ask product (step 0)' },
  funnelAskAddress: { id: 'Tanya alamat (setelah harga)', en: 'Ask address (after price)' },
  funnelAskBasket: { id: 'Konklusi keranjang (2 produk) — {{daftar_produk}}', en: 'Basket conclusion (2 products)' },
  funnelAskBasketOpen: { id: 'Konklusi keranjang (3+ produk)', en: 'Basket conclusion (3+ products)' },
  funnelAskQty: { id: 'Tanya qty (setelah ongkir)', en: 'Ask qty (after shipping)' },
  funnelAskPayment: { id: 'Tanya metode (menempel TOTAL)', en: 'Ask payment (with TOTAL)' },
  funnelAskLandmark: { id: 'Tanya patokan rumah (setelah metode)', en: 'Ask house landmark (after payment)' },
  // <<< ANGGA
  // >>> ANGGA — S1 (2026-08-05): telemetri gerbang uang.
  gateStatsTitle: { id: 'Telemetri gerbang uang', en: 'Money gate telemetry' },
  gateStatsIntro: {
    id: 'Draft yang DITAHAN gerbang uang beserta alasannya (jendela {days} hari, dibaca dari draft tersimpan). Kalau satu alasan sering muncul untuk kalimat yang sebenarnya benar, itu kandidat pelonggaran berikutnya.',
    en: 'Drafts HELD by the money gate and why ({days}-day window, read from stored drafts).',
  },
  gateStatsEmpty: { id: 'Tidak ada draft tertahan pada jendela ini.', en: 'No held drafts in this window.' },
  gateStatsFail: { id: 'Telemetri belum bisa dibaca.', en: 'Telemetry could not be read.' },
  gateReason_label_rancu: { id: 'Label rancu (penjaga kata)', en: 'Ambiguous label (word guard)' },
  gateReason_token_tak_dikenal: { id: 'Penanda tak dikenal/tak tersedia', en: 'Unknown/unavailable placeholder' },
  gateReason_digit_mentah: { id: 'Angka ditulis langsung oleh model', en: 'Raw digits written by model' },
  gateReason_bridge_asumsi: { id: 'Pakai asumsi tanpa sebut nama barang', en: 'Assumption without item name' },
  gateReason_istilah_internal: { id: 'Istilah internal bocor ke balasan', en: 'Internal phrasing leaked into reply' },
  gateReason_kontradiksi_data: { id: 'Menyangkal data yang sudah tersedia', en: 'Denied data that was available' },
  gateReason_funnel_dilanggar: { id: 'Melanggar alur penjualan wajib', en: 'Violated mandatory sales flow' },
  gateReason_lainnya: { id: 'Lainnya', en: 'Other' },
  // <<< ANGGA
};

interface OrderContextSettings {
  orderContextStaleHours: number;
  orderCancelKeywords: string[];
  orderAggregateKeywords: string[];
  orderAffirmationKeywords: string[];
  orderNegationKeywords: string[];
  orderFillerWords: string[];
  orderClosingNote: string;
  orderBridgeEnforcement: 'prompt_only' | 'retry_once';
  orderDeixisKeywords: string[];
  orderOfferWindowMinutes: number;
  orderGlobalTokens: Record<string, string>;
  orderFormHintKeywords: string[];
  orderReferenceKeywords: string[];
  orderNegoKeywords: string[];
  // >>> ANGGA — F1/F2 (2026-08-05)
  orderMoneyAskKeywords: string[];
  orderFormWelcomeTemplate: string;
  orderMetaPhraseBlacklist: string[];
  orderContradictionPhrases: string[];
  orderFunnelEnabled: boolean;
  orderFunnelAskItem: string;
  orderFunnelAskAddress: string;
  orderFunnelAskBasket: string;
  orderFunnelAskBasketOpen: string;
  orderFunnelAskQty: string;
  orderFunnelAskPayment: string;
  orderFunnelAskLandmark: string;
  // <<< ANGGA
}

const fieldCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-sentinel-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

export default function OrderMemorySettingsPage() {
  const t = useT(dict);
  const { allowed: canEdit, ready: roleReady } = useHasRole('owner');
  const [data, setData] = useState<OrderContextSettings | null>(null);
  // Kamus token disimpan MENTAH di state sendiri (pola aliasText di halaman
  // shipping): baris setengah-diketik tidak boleh hilang dari layar.
  const [tokensText, setTokensText] = useState('');
  // >>> ANGGA — S1: telemetri gerbang uang (baca-saja; gagal → kartu diam).
  const [gateStats, setGateStats] = useState<{
    days: number;
    totalDraftDitahan: number;
    totalAlasan: number;
    perAlasan: Record<string, number>;
    gagalBaca?: boolean;
  } | null>(null);
  // <<< ANGGA
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ orderContext: OrderContextSettings }>('/settings')
      .then((all) => {
        setData(all.orderContext);
        setTokensText(formatAliases(all.orderContext.orderGlobalTokens));
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('loadError')));
    // >>> ANGGA — S1: telemetri terpisah dari settings; gagal tidak mengganggu form.
    api<{ days: number; totalDraftDitahan: number; totalAlasan: number; perAlasan: Record<string, number>; gagalBaca?: boolean }>(
      '/shipping/money-gate-stats?days=7',
    )
      .then(setGateStats)
      .catch(() => setGateStats(null));
    // <<< ANGGA
  }, [t]);

  function patch<K extends keyof OrderContextSettings>(key: K, value: OrderContextSettings[K] | string) {
    setData((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSavedMsg(null);
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const payload = {
        orderContextStaleHours: Number(data.orderContextStaleHours),
        orderCancelKeywords: data.orderCancelKeywords,
        orderAggregateKeywords: data.orderAggregateKeywords,
        orderAffirmationKeywords: data.orderAffirmationKeywords,
        orderNegationKeywords: data.orderNegationKeywords,
        orderFillerWords: data.orderFillerWords,
        orderClosingNote: data.orderClosingNote,
        orderBridgeEnforcement: data.orderBridgeEnforcement,
        orderDeixisKeywords: data.orderDeixisKeywords,
        orderOfferWindowMinutes: Number(data.orderOfferWindowMinutes),
        orderGlobalTokens: parseAliases(tokensText),
        orderFormHintKeywords: data.orderFormHintKeywords,
        orderReferenceKeywords: data.orderReferenceKeywords,
        orderNegoKeywords: data.orderNegoKeywords,
        // >>> ANGGA — F1/F2 (2026-08-05)
        orderMoneyAskKeywords: data.orderMoneyAskKeywords,
        // >>> ANGGA — E1+E3 (2026-08-05)
        orderFormWelcomeTemplate: data.orderFormWelcomeTemplate ?? '',
        orderMetaPhraseBlacklist: data.orderMetaPhraseBlacklist ?? [],
        orderContradictionPhrases: data.orderContradictionPhrases ?? [],
        // >>> ANGGA — Q-Chain (2026-08-05)
        orderFunnelEnabled: data.orderFunnelEnabled !== false,
        orderFunnelAskItem: data.orderFunnelAskItem ?? '',
        orderFunnelAskAddress: data.orderFunnelAskAddress ?? '',
        orderFunnelAskBasket: data.orderFunnelAskBasket ?? '',
        orderFunnelAskBasketOpen: data.orderFunnelAskBasketOpen ?? '',
        orderFunnelAskQty: data.orderFunnelAskQty ?? '',
        orderFunnelAskPayment: data.orderFunnelAskPayment ?? '',
        orderFunnelAskLandmark: data.orderFunnelAskLandmark ?? '',
        // <<< ANGGA
      };
      const updated = await api<{ orderContext: OrderContextSettings }>('/settings', {
        method: 'PUT',
        body: JSON.stringify({ orderContext: payload }),
      });
      setData(updated.orderContext);
      setTokensText(formatAliases(updated.orderContext.orderGlobalTokens));
      setSavedMsg(t('saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="scrollbar-thin mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
          <Link
            href="/settings/ai"
            className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-[13px] font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <Cpu className="h-4 w-4" aria-hidden="true" />
            {t('tabGeneral')}
          </Link>
          <Link
            href="/settings/shipping"
            className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-[13px] font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <Package className="h-4 w-4" aria-hidden="true" />
            {t('tabShipping')}
          </Link>
          <span className="flex shrink-0 items-center gap-1.5 border-b-2 border-sentinel-600 px-3 py-2.5 text-[13px] font-medium text-sentinel-700 dark:text-sentinel-300">
            <Brain className="h-4 w-4" aria-hidden="true" />
            {t('tabOrderMemory')}
          </span>
        </div>

        {roleReady && !canEdit && (
          <Card className="mb-4 flex items-start gap-2 border-review-200 bg-review-50 p-3 dark:border-review-700/40 dark:bg-review-900/20">
            <ShieldWarning className="mt-0.5 h-4 w-4 shrink-0 text-review-600" aria-hidden="true" />
            <p className="text-[13px] text-review-700 dark:text-review-300">{t('readOnly')}</p>
          </Card>
        )}

        {error && (
          <Card className="mb-4 border-danger-200 bg-danger-50 p-3 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{error}</p>
          </Card>
        )}

        {!data ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((n) => <div key={n} className="h-10 rounded animate-shimmer" />)}
          </div>
        ) : (
          <Card className="p-4 sm:p-5">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('secCore')}</h2>
              <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">{t('secCoreIntro')}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('stale')} hint={t('staleHint')}>
                  <input type="number" min="1" className={fieldCls} disabled={!canEdit}
                    value={data.orderContextStaleHours}
                    onChange={(e) => patch('orderContextStaleHours', e.target.value)} />
                </Field>
                <Field label={t('bridge')} hint={t('bridgeHint')}>
                  <select className={fieldCls} disabled={!canEdit}
                    value={data.orderBridgeEnforcement}
                    onChange={(e) => patch('orderBridgeEnforcement', e.target.value as 'prompt_only' | 'retry_once')}>
                    <option value="retry_once">{t('bridgeRetry')}</option>
                    <option value="prompt_only">{t('bridgePrompt')}</option>
                  </select>
                </Field>
              </div>
              {/* >>> ANGGA — F1/F2 (2026-08-05): kata tanya-uang */}
              <Field label={t('moneyAskKw')} hint={`${t('listHint')} ${t('moneyAskKwHint')}`}>
                <input className={fieldCls} disabled={!canEdit}
                  value={(data.orderMoneyAskKeywords ?? []).join(', ')}
                  onChange={(e) => patch('orderMoneyAskKeywords', parseList(e.target.value))} />
              </Field>
              {/* <<< ANGGA */}
              <Field label={t('cancelKw')} hint={`${t('listHint')} ${t('cancelKwHint')}`}>
                <input className={fieldCls} disabled={!canEdit} value={data.orderCancelKeywords.join(', ')}
                  onChange={(e) => patch('orderCancelKeywords', parseList(e.target.value))} />
              </Field>
              <Field label={t('aggregateKw')} hint={`${t('listHint')} ${t('aggregateKwHint')}`}>
                <input className={fieldCls} disabled={!canEdit} value={data.orderAggregateKeywords.join(', ')}
                  onChange={(e) => patch('orderAggregateKeywords', parseList(e.target.value))} />
              </Field>
              <Field label={t('affirmKw')} hint={`${t('listHint')} ${t('affirmKwHint')}`}>
                <input className={fieldCls} disabled={!canEdit} value={data.orderAffirmationKeywords.join(', ')}
                  onChange={(e) => patch('orderAffirmationKeywords', parseList(e.target.value))} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('negationKw')} hint={`${t('listHint')} ${t('negationKwHint')}`}>
                  <input className={fieldCls} disabled={!canEdit} value={data.orderNegationKeywords.join(', ')}
                    onChange={(e) => patch('orderNegationKeywords', parseList(e.target.value))} />
                </Field>
                <Field label={t('fillerKw')} hint={`${t('listHint')} ${t('fillerKwHint')}`}>
                  <input className={fieldCls} disabled={!canEdit} value={data.orderFillerWords.join(', ')}
                    onChange={(e) => patch('orderFillerWords', parseList(e.target.value))} />
                </Field>
              </div>

              <h2 className="pt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{t('secOffer')}</h2>
              <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">{t('secOfferIntro')}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('offerWindow')} hint={t('offerWindowHint')}>
                  <input type="number" min="1" className={fieldCls} disabled={!canEdit}
                    value={data.orderOfferWindowMinutes}
                    onChange={(e) => patch('orderOfferWindowMinutes', e.target.value)} />
                </Field>
                <Field label={t('deixisKw')} hint={`${t('listHint')} ${t('deixisKwHint')}`}>
                  <input className={fieldCls} disabled={!canEdit} value={data.orderDeixisKeywords.join(', ')}
                    onChange={(e) => patch('orderDeixisKeywords', parseList(e.target.value))} />
                </Field>
              </div>
              <Field label={t('formKw')} hint={`${t('listHint')} ${t('formKwHint')}`}>
                <input className={fieldCls} disabled={!canEdit} value={data.orderFormHintKeywords.join(', ')}
                  onChange={(e) => patch('orderFormHintKeywords', parseList(e.target.value))} />
              </Field>
              <Field label={t('referenceKw')} hint={`${t('listHint')} ${t('referenceKwHint')}`}>
                <input className={fieldCls} disabled={!canEdit} value={data.orderReferenceKeywords.join(', ')}
                  onChange={(e) => patch('orderReferenceKeywords', parseList(e.target.value))} />
              </Field>
              {/* >>> ANGGA — E1 (2026-08-05): template sambutan form */}
              <Field label={t('formWelcome')} hint={t('formWelcomeHint')}>
                <textarea
                  rows={7}
                  spellCheck={false}
                  aria-label={t('formWelcome')}
                  className={`${fieldCls} h-auto resize-y py-2 leading-5`}
                  disabled={!canEdit}
                  value={data.orderFormWelcomeTemplate ?? ''}
                  onChange={(e) => patch('orderFormWelcomeTemplate', e.target.value)}
                />
              </Field>
              {/* >>> ANGGA — E3 (2026-08-05): blacklist frasa internal */}
              <Field label={t('metaBlacklist')} hint={`${t('listHint')} ${t('metaBlacklistHint')}`}>
                <input className={fieldCls} disabled={!canEdit}
                  value={(data.orderMetaPhraseBlacklist ?? []).join(', ')}
                  onChange={(e) => patch('orderMetaPhraseBlacklist', parseList(e.target.value))} />
              </Field>
              {/* >>> ANGGA — P2 (2026-08-05): frasa penyangkalan data */}
              <Field label={t('contradictionKw')} hint={`${t('listHint')} ${t('contradictionKwHint')}`}>
                <input className={fieldCls} disabled={!canEdit}
                  value={(data.orderContradictionPhrases ?? []).join(', ')}
                  onChange={(e) => patch('orderContradictionPhrases', parseList(e.target.value))} />
              </Field>
              {/* <<< ANGGA */}

              <h2 className="pt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{t('secTokens')}</h2>
              <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">{t('secTokensIntro')}</p>
              <Field label={t('globalTokens')} hint={t('globalTokensHint')}>
                <textarea
                  rows={6}
                  spellCheck={false}
                  aria-label={t('globalTokens')}
                  className={`${fieldCls} h-auto resize-y py-2 font-mono leading-5`}
                  disabled={!canEdit}
                  value={tokensText}
                  onChange={(e) => { setTokensText(e.target.value); setSavedMsg(null); }}
                />
              </Field>
              <Field label={t('closingNote')} hint={t('closingNoteHint')}>
                <textarea
                  rows={5}
                  spellCheck={false}
                  aria-label={t('closingNote')}
                  className={`${fieldCls} h-auto resize-y py-2 leading-5`}
                  disabled={!canEdit}
                  value={data.orderClosingNote}
                  onChange={(e) => patch('orderClosingNote', e.target.value)}
                />
              </Field>

              {/* >>> ANGGA — Q-Chain (2026-08-05): funnel pertanyaan berantai */}
              <h2 className="pt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{t('secFunnel')}</h2>
              <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">{t('secFunnelIntro')}</p>
              <label className="flex items-center gap-2 text-[13px] text-gray-700 dark:text-gray-200">
                <input type="checkbox" disabled={!canEdit} checked={data.orderFunnelEnabled !== false}
                  onChange={(e) => patch('orderFunnelEnabled', e.target.checked)} />
                {t('funnelEnabled')}
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('funnelAskItem')}>
                  <input className={fieldCls} disabled={!canEdit} value={data.orderFunnelAskItem ?? ''}
                    onChange={(e) => patch('orderFunnelAskItem', e.target.value)} />
                </Field>
                <Field label={t('funnelAskAddress')}>
                  <input className={fieldCls} disabled={!canEdit} value={data.orderFunnelAskAddress ?? ''}
                    onChange={(e) => patch('orderFunnelAskAddress', e.target.value)} />
                </Field>
                <Field label={t('funnelAskBasket')}>
                  <input className={fieldCls} disabled={!canEdit} value={data.orderFunnelAskBasket ?? ''}
                    onChange={(e) => patch('orderFunnelAskBasket', e.target.value)} />
                </Field>
                <Field label={t('funnelAskBasketOpen')}>
                  <input className={fieldCls} disabled={!canEdit} value={data.orderFunnelAskBasketOpen ?? ''}
                    onChange={(e) => patch('orderFunnelAskBasketOpen', e.target.value)} />
                </Field>
                <Field label={t('funnelAskQty')}>
                  <input className={fieldCls} disabled={!canEdit} value={data.orderFunnelAskQty ?? ''}
                    onChange={(e) => patch('orderFunnelAskQty', e.target.value)} />
                </Field>
                <Field label={t('funnelAskPayment')}>
                  <input className={fieldCls} disabled={!canEdit} value={data.orderFunnelAskPayment ?? ''}
                    onChange={(e) => patch('orderFunnelAskPayment', e.target.value)} />
                </Field>
                <Field label={t('funnelAskLandmark')}>
                  <input className={fieldCls} disabled={!canEdit} value={data.orderFunnelAskLandmark ?? ''}
                    onChange={(e) => patch('orderFunnelAskLandmark', e.target.value)} />
                </Field>
              </div>
              {/* <<< ANGGA */}

              <h2 className="pt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{t('secNego')}</h2>
              <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">{t('secNegoIntro')}</p>
              <Field label={t('negoKw')} hint={`${t('listHint')} ${t('negoKwHint')}`}>
                <input className={fieldCls} disabled={!canEdit} value={data.orderNegoKeywords.join(', ')}
                  onChange={(e) => patch('orderNegoKeywords', parseList(e.target.value))} />
              </Field>
            </div>

            <div className="mt-5 flex items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
              <Button onClick={save} disabled={!canEdit || saving}>
                <FloppyDisk className="h-4 w-4" aria-hidden="true" />
                {saving ? t('saving') : t('save')}
              </Button>
              {savedMsg && <span className="text-[13px] font-medium text-channel-700 dark:text-channel-400">{savedMsg}</span>}
            </div>
          </Card>
        )}

        {/* >>> ANGGA — S1 (2026-08-05): kartu telemetri gerbang uang, baca-saja */}
        {gateStats && (
          <Card className="mt-4 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('gateStatsTitle')}</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('gateStatsIntro').replace('{days}', String(gateStats.days))}
            </p>
            {gateStats.gagalBaca ? (
              <p className="mt-3 text-[13px] text-gray-500 dark:text-gray-400">{t('gateStatsFail')}</p>
            ) : gateStats.totalDraftDitahan === 0 ? (
              <p className="mt-3 text-[13px] text-gray-500 dark:text-gray-400">{t('gateStatsEmpty')}</p>
            ) : (
              <div className="mt-3 space-y-1">
                <p className="text-[13px] font-medium text-gray-800 dark:text-gray-200">
                  {gateStats.totalDraftDitahan} draft · {gateStats.totalAlasan} alasan
                </p>
                {(['label_rancu', 'token_tak_dikenal', 'digit_mentah', 'bridge_asumsi', 'istilah_internal', 'kontradiksi_data', 'funnel_dilanggar', 'lainnya'] as const)
                  .filter((k) => (gateStats.perAlasan[k] ?? 0) > 0)
                  .map((k) => (
                    <div key={k} className="flex items-center justify-between text-[13px] text-gray-700 dark:text-gray-300">
                      <span>{t(`gateReason_${k}`)}</span>
                      <span className="font-semibold">{gateStats.perAlasan[k]}</span>
                    </div>
                  ))}
              </div>
            )}
          </Card>
        )}
        {/* <<< ANGGA */}
      </div>
    </AppLayout>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-gray-700 dark:text-gray-200">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}
