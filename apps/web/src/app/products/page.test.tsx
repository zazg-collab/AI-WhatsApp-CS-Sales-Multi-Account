import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

const apiMock = vi.fn();
// `hasRole` sengaja mengembalikan true — meniru admin yang sudah login, yaitu
// kondisi yang dulu memicu bug hydration.
vi.mock('@/lib/api', () => ({
  api: (...a: any[]) => apiMock(...a),
  uploadFile: vi.fn(),
  hasRole: () => true,
  getToken: () => 't',
}));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

import ProductsPage from './page';

const PRODUK = [
  { id: 'p1', sku: 'GLK-01', name: 'Golok Cordova', category: 'golok', price: 150000, currency: 'IDR', stock: 10, unit: null, status: 'active', lastSyncedAt: null, weightGrams: null },
  { id: 'p2', sku: 'PSU-01', name: 'Pisau Dapur', category: 'pisau', price: 90000, currency: 'IDR', stock: 4, unit: null, status: 'active', lastSyncedAt: null, weightGrams: 2500 },
];

// Query lewat aria-label, BUKAN indeks getAllByRole: kotak pencarian di atas
// tabel juga bertipe textbox, jadi indeks bergeser dan tesnya diam-diam
// menguji elemen yang salah.
const kolomBerat = (nama: string) => screen.getByLabelText(`Weight ${nama}`) as HTMLInputElement;
const gembok = (nama: string) => screen.getByRole('button', { name: `Unlock weight ${nama}` });

async function bukaGembok(nama: string) {
  fireEvent.click(gembok(nama));
  await waitFor(() => expect(kolomBerat(nama)).toBeEnabled());
  return kolomBerat(nama);
}

describe('ProductsPage — kolom berat (modul ongkir)', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path = '') => {
      if (path === '/shipping/status') return Promise.resolve({ defaultWeightGrams: 1000 });
      if (path.startsWith('/products/sources')) return Promise.resolve([]);
      if (path.startsWith('/products')) return Promise.resolve(PRODUK);
      return Promise.resolve({});
    });
  });

  /**
   * >>> ANGGA — regresi bug hydration.
   *
   * `hasRole()` membaca JWT dari localStorage SAAT RENDER: di server selalu
   * false, di browser bisa true. Dulu sel berat memakainya langsung untuk
   * memilih <input> vs <span> pada posisi DOM yang sama, dan Next.js gagal
   * hydrate halaman ini ("initial UI does not match what was rendered on the
   * server"). Render server HARUS tidak memuat kontrol khusus peran.
   */
  it('render server tidak memuat kontrol khusus peran (hydration aman)', () => {
    const html = renderToString(<ProductsPage />);
    expect(html).not.toContain('Unlock weight');
    expect(html).not.toContain('Stock sources');
  });

  it('menampilkan nilai dari server; kosong = pakai default toko', async () => {
    render(<ProductsPage />);
    await screen.findByLabelText('Weight Golok Cordova');
    expect(kolomBerat('Pisau Dapur').value).toBe('2500');
    expect(kolomBerat('Golok Cordova').value).toBe('');
    // Placeholder diambil dari config server, bukan angka yang ditulis di kode.
    await waitFor(() => expect(kolomBerat('Golok Cordova').placeholder).toBe('1000'));
  });

  // >>> ANGGA: penjaga jebakan `useHasRole`.
  // `canManage` baru true SESUDAH mount. Fetch khusus admin karena itu dipisah
  // ke efeknya sendiri: kalau ikut menempel di load() (deps [debouncedSearch,t])
  // ia selamanya jalan saat peran masih false dan tidak pernah dicoba lagi —
  // sumber data & berat default diam-diam tidak pernah termuat. Menambah
  // `canManage` ke deps load() juga salah: daftar produk ketarik dua kali.
  it('data khusus admin tetap termuat sesudah peran diketahui, tanpa menarik produk dua kali', async () => {
    render(<ProductsPage />);
    await screen.findByLabelText('Weight Golok Cordova');
    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith('/products/sources/list');
      expect(apiMock).toHaveBeenCalledWith('/shipping/status');
    });
    const daftarProduk = apiMock.mock.calls.filter((c) => String(c[0]).startsWith('/products') && !String(c[0]).startsWith('/products/sources'));
    expect(daftarProduk).toHaveLength(1);
  });

  it('terkunci secara bawaan; gembok yang membukanya', async () => {
    render(<ProductsPage />);
    await screen.findByLabelText('Weight Golok Cordova');
    expect(kolomBerat('Golok Cordova')).toBeDisabled();
    expect(kolomBerat('Pisau Dapur')).toBeDisabled();
    await bukaGembok('Golok Cordova');
    // Membuka satu baris tidak ikut membuka baris lain.
    expect(kolomBerat('Pisau Dapur')).toBeDisabled();
  });

  it('hanya menerima angka; huruf diabaikan', async () => {
    render(<ProductsPage />);
    await screen.findByLabelText('Weight Golok Cordova');
    const input = await bukaGembok('Golok Cordova');
    fireEvent.change(input, { target: { value: '1a4b0c0' } });
    expect(kolomBerat('Golok Cordova').value).toBe('1400');
  });

  it('menyimpan lewat PATCH, dan kosong dikirim sebagai null', async () => {
    render(<ProductsPage />);
    await screen.findByLabelText('Weight Golok Cordova');

    const input = await bukaGembok('Golok Cordova');
    fireEvent.change(input, { target: { value: '1400' } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/products/p1', {
        method: 'PATCH',
        body: JSON.stringify({ weightGrams: 1400 }),
      }),
    );
    // Setelah blur, barisnya terkunci lagi dengan sendirinya.
    await waitFor(() => expect(kolomBerat('Golok Cordova')).toBeDisabled());

    const kedua = await bukaGembok('Pisau Dapur');
    fireEvent.change(kedua, { target: { value: '' } });
    fireEvent.blur(kedua);
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/products/p2', {
        method: 'PATCH',
        body: JSON.stringify({ weightGrams: null }),
      }),
    );
  });

  it('tidak mengirim PATCH kalau nilainya tidak berubah', async () => {
    render(<ProductsPage />);
    await screen.findByLabelText('Weight Golok Cordova');
    const input = await bukaGembok('Pisau Dapur');
    apiMock.mockClear();
    fireEvent.blur(input);
    await new Promise((r) => setTimeout(r, 20));
    expect(apiMock).not.toHaveBeenCalledWith('/products/p2', expect.anything());
  });
});
