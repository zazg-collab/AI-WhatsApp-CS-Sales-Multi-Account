/**
 * >>> ANGGA — F1 gelombang v2 (2026-08-09, cowork): SATU-SATUNYA definisi skema
 * tool ongkir. Sebelum ini ada TIGA salinan yang saling berbeda:
 *
 *   1. berkas ini sendiri — KODE MATI, tidak pernah di-import. Lahir & berhenti
 *      di commit `4d90309` ("chore: save current state for deepseek overhaul").
 *      Skemanya memakai `total_weight_grams`/`subtotal` yang TIDAK PERNAH
 *      diterima executor `llmCalculateShipping`, dan tanpa `province` — kalau
 *      berkas itu sempat diwiring, `isRegionCodBlocked('')` mengembalikan false
 *      dan blokir COD Papua/Maluku/Sultra bocor diam-diam.
 *   2. inline di `ai.service.ts` — skemanya benar (cocok executor), tapi
 *      deskripsinya lemah dan `items` ditandai WAJIB.
 *   3. inline di `test-harness/chat-session.manager.ts` — deskripsi jauh lebih
 *      rinci, dan `items` OPSIONAL.
 *
 * Yang dipakai di sini: SKEMA dari (2) + DESKRIPSI dari (3) + `items` opsional
 * dari (3). Deskripsi menyetir perilaku model, jadi ia bagian dari kontrak —
 * bukan komentar.
 *
 * ⚠️ KOREKSI (audit pasca-rollback 2026-08-09): versi (3) dipilih BUKAN karena
 * lebih baru. Ketiganya lahir di commit yang SAMA (`4d90309`), dan skema di
 * `chat-session.manager.ts` TIDAK berubah sesudah rollback — yang berubah di
 * sana cuma threading `sessionId` dan daftar model. Dasar pemilihannya murni
 * kualitas + kecocokan dengan executor: deskripsi `keyword` versi (3) menyuruh
 * model mengirim GABUNGAN kecamatan+kota, dan itu memang yang dibutuhkan
 * `llmSearchDestinations` (ia menggabungkan keyword+provinsi untuk query API
 * demi menghindari limit 50 baris).
 *
 * ✅ EFEK NYATA `items` opsional: commit `e4415a5` (pasca-rollback) menambahkan
 * cabang `isShippingOnly` di `llmCalculateShipping` — instruksi "gunakan
 * {{ongkir}}, JANGAN bahas COD/Transfer, lalu tanya produk apa yang mau
 * dipesan" (penopang aturan keranjang kosong). Selama `items` masih WAJIB di
 * skema produksi, cabang itu **tidak pernah bisa tercapai dari percakapan
 * pelanggan** — hanya dari test-harness. F1 menghidupkannya di produksi.
 *
 * ⚠️ `items` opsional berarti pemanggil WAJIB mem-default ke `[]`:
 * `quoteUntukTujuan` membaca `input.items.length`, jadi `undefined` melempar.
 * Lihat `args.items ?? []` di kedua executor. <<<
 */
export const shippingTools = [
  {
    type: 'function',
    function: {
      name: 'search_destinations',
      description:
        'WAJIB DIPANGGIL KETIKA pelanggan menanyakan ongkos kirim. Gunakan ini untuk memvalidasi kecamatan/kota tujuan pengiriman di sistem logistik sebelum menghitung ongkos kirim. Jangan pernah menebak/mengira-ngira ongkos kirim tanpa memanggil tool ini terlebih dahulu.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description:
              'Masukkan GABUNGAN nama Kecamatan dan Kota/Kabupaten yang disebut pelanggan untuk pencarian terbaik. Contoh: "Sandubaya Mataram" atau "Cibinong Bogor".',
          },
          province: {
            type: 'string',
            description: 'Nama provinsi jika pelanggan menyebutkannya spesifik, jika tidak biarkan kosong.',
          },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_shipping',
      description:
        'WAJIB dipanggil SETELAH berhasil mendapatkan hasil dari search_destinations. Gunakan tool ini untuk menghitung ongkos kirim. Masukkan data dari search_destinations ke dalam parameter yang diminta. JANGAN PERNAH MENGHITUNG ONGKIR SENDIRI tanpa tool ini.',
      parameters: {
        type: 'object',
        properties: {
          destination_id: { type: 'string', description: 'ID lokasi dari hasil search_destinations' },
          city: { type: 'string', description: 'Nama kota dari hasil search_destinations' },
          province: { type: 'string', description: 'Nama provinsi dari hasil search_destinations' },
          label: { type: 'string', description: 'Label lengkap dari hasil search_destinations' },
          items: {
            type: 'array',
            description: 'Daftar produk yang ingin dibeli pelanggan (kosongkan jika belum tahu/tidak disebutkan)',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                qty: { type: 'number' },
              },
              required: ['name', 'qty'],
            },
          },
        },
        required: ['destination_id', 'city', 'province', 'label'],
      },
    },
  },
];

/** Daftar kanonik nama tool ongkir.
 *  ⚠️ Dipakai SPEC saja untuk saat ini — router executor di `ai.service.ts` dan
 *  `chat-session.manager.ts` MASIH memakai literal string (`fnName === '...'`),
 *  karena if/else per-tool memang butuh nama satu per satu, bukan daftar.
 *  Jangan mengklaim konstanta ini menghapus string lepas — belum. */
export const SHIPPING_TOOL_NAMES = shippingTools.map((t) => t.function.name);
