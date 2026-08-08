// >>> DEEPSEEK — ROMBAK (2026-08-08): selaraskan dengan arsitektur tool-calling baru.
// Semua tool return JSON { ok, data?, error?, action }.
// `action: 'proceed' | 'ask_user' | 'reply_to_user'` sebagai sinyal eksplisit ke LLM.
export const shippingTools = [
  {
    type: 'function',
    function: {
      name: 'search_destinations',
      description: `Mencari destinasi pengiriman di sistem logistik. Panggil saat pelanggan menanyakan ongkir atau menyebut lokasi pengiriman.

CARA KERJA tool ini (return value berisi field "action"):
- action: "proceed" → destinasi sudah PASTI (1 hasil). LANJUT panggil calculate_shipping.
- action: "ask_user" → hasil ambigu atau tidak ditemukan. BALAS pelanggan, minta klarifikasi. JANGAN panggil calculate_shipping.

TIPS: Jika sebelumnya kamu sudah mencari lokasi dan hasilnya ambigu, isi parameter previous_keyword dengan kata kunci sebelumnya.`,
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Nama kecamatan, kota, atau kabupaten. Contoh: "Purwokerto Timur", "Bandung", "Mataram".'
          },
          province: {
            type: 'string',
            description: 'Opsional. Nama provinsi jika disebutkan pelanggan. Contoh: "Jawa Tengah", "NTB".'
          },
          previous_keyword: {
            type: 'string',
            description: 'Kata kunci pencarian SEBELUMNYA, jika hasil sebelumnya ambigu dan pelanggan memberi detail tambahan. Sistem akan otomatis menggabungkan kata kunci.'
          }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_shipping',
      description: `Menghitung ongkos kirim ke destinasi yang SUDAH PASTI. HANYA panggil setelah search_destinations mengembalikan action: "proceed".

Return value tool ini berisi field "action":
- action: "reply_to_user" → ongkir berhasil. BALAS pelanggan, gunakan token {{blok_total}}.
- action: "ask_user" → terjadi kendala. Sampaikan error ke pelanggan.`,
      parameters: {
        type: 'object',
        properties: {
          destination_id: {
            type: 'string',
            description: 'ID destinasi resmi yang didapat dari tool search_destinations.'
          },
          city: {
            type: 'string',
            description: 'Nama kota dari hasil search_destinations.'
          },
          province: {
            type: 'string',
            description: 'Nama provinsi dari hasil search_destinations.'
          },
          label: {
            type: 'string',
            description: 'Label lengkap dari hasil search_destinations.'
          },
          items: {
            type: 'array',
            description: 'Daftar produk yang ingin dibeli ([] jika belum tahu).',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                qty: { type: 'number' }
              },
              required: ['name', 'qty']
            }
          }
        },
        required: ['destination_id', 'city', 'province', 'label']
      }
    }
  }
];
// <<< DEEPSEEK