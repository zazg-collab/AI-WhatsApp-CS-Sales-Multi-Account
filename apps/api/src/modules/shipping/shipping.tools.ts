export const shippingTools = [
  {
    type: 'function',
    function: {
      name: 'search_destinations',
      description: 'Mencari daftar destinasi (kecamatan/kota/kabupaten) berdasarkan kata kunci yang diberikan pelanggan. Gunakan tool ini HANYA JIKA pelanggan memberikan alamat yang ambigu atau kamu butuh ID destinasi.',
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
      description: 'Menghitung ongkos kirim dan total tagihan (termasuk COD) ke suatu destinasi.',
      parameters: {
        type: 'object',
        properties: {
          destination_id: {
            type: 'string',
            description: 'ID destinasi resmi yang didapat dari tool search_destinations.'
          },
          total_weight_grams: {
            type: 'number',
            description: 'Total berat pesanan dalam gram. (Jika tidak diketahui, asumsikan 1000 gram atau 1 kg).'
          },
          subtotal: {
            type: 'number',
            description: 'Total harga produk sebelum ongkir (jika pelanggan ingin COD). Isi 0 jika belum tahu harganya.'
          }
        },
        required: ['destination_id', 'total_weight_grams', 'subtotal']
      }
    }
  }
];
