/**
 * >>> ANGGA — F3 (2026-08-09, cowork): SATU-SATUNYA definisi tool knowledge.
 *
 * Temuan audit F1: `search_knowledge` ditulis inline DUA kali — di
 * `ai.service.ts` (produksi) dan `test-harness/chat-session.manager.ts` — dan
 * **isinya BERBEDA** (deskripsi tool dan deskripsi `query` tidak sama). Artinya
 * produksi dan tester memberi tahu model hal yang berbeda tentang tool yang
 * sama. Itu penyakit identik dengan T2, cuma untuk tool yang tidak ikut masuk
 * ruang lingkup F1, dan langsung bertabrakan dengan K10 ("tester harus sama
 * persis dengan produksi").
 *
 * ARAH PENYATUAN — sengaja BERBEDA dari `shipping.tools.ts`:
 *   - Di shipping.tools.ts versi TESTER yang menang, karena deskripsinya lebih
 *     cocok dengan executor (`llmSearchDestinations` butuh keyword gabungan).
 *   - Di sini versi PRODUKSI yang menang. Kedua deskripsi sama-sama layak, jadi
 *     dipilih yang membuat perilaku PRODUKSI TIDAK BERUBAH sama sekali —
 *     testerlah yang menyesuaikan diri. Kalau tidak ada alasan teknis untuk
 *     memilih, produksi adalah rujukan.
 *
 * ⚠️ Catatan kualitas (TIDAK diubah di sini supaya penyatuan tetap netral
 * perilaku): contoh di deskripsi `query` memakai "harga sepatu nike", padahal
 * toko ini menjual pisau/golok. Kandidat perbaikan tersendiri — jangan
 * diselundupkan ke dalam commit penyatuan.
 */
export const searchKnowledgeTool = {
  type: 'function',
  function: {
    name: 'search_knowledge',
    description:
      'Cari informasi produk, promo, jam operasional, atau kebijakan toko dari basis pengetahuan (knowledge base). Gunakan tool ini jika pelanggan menanyakan info seputar produk atau toko.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Kata kunci pencarian, misalnya nama produk atau topik (contoh: "harga sepatu nike", "jam buka", "promo lebaran")',
        },
      },
      required: ['query'],
    },
  },
};

/** Nama tool knowledge — dipakai spec sebagai daftar kanonik. */
export const KNOWLEDGE_TOOL_NAME = searchKnowledgeTool.function.name;
