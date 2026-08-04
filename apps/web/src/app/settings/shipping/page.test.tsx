import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({
  api: (...a: any[]) => apiMock(...a),
  hasRole: () => true,
  getToken: () => 't',
}));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));

import ShippingSettingsPage from './page';
import { parseList, parseItems, formatIdr, parseAliases, formatAliases } from './shipping.utils';

const SHIPPING = {
  mengantarApiKeySet: true,
  mengantarOriginId: 'origin-1',
  baseUrl: 'https://app.mengantar.com',
  courierExclude: ['paxel', 'SAPLite'],
  codAllowlist: ['JNE'],
  codBlockedRegionKeywords: ['papua', 'maluku'],
  defaultWeightGrams: 1000,
  quoteCacheTtlMs: 21_600_000,
  discountMaxPerPcs: 5000, // >>> ANGGA — Fase 113: di-rename dari discountMaxPerOrder <<<
  priceRoundingIncrement: 500,
  shippingDiscountPercentMax: 20, // >>> ANGGA — Fase 113 <<<
  destinationAliases: { solo: 'surakarta', jogja: 'yogyakarta' },
};

function mockApi(over: Record<string, unknown> = {}) {
  apiMock.mockImplementation((path = '', init?: { method?: string; body?: string }) => {
    if (path === '/settings' && init?.method === 'PUT') return Promise.resolve({ shipping: SHIPPING });
    if (path === '/settings') return Promise.resolve({ shipping: SHIPPING });
    if (path === '/shipping/status') return Promise.resolve({ configured: true, cache: { size: 3 } });
    if (path === '/shipping/test-quote') return Promise.resolve(over.quote ?? { status: 'api_error' });
    return Promise.resolve({});
  });
}

describe('pembantu murni', () => {
  it('parseList membuang entri kosong', () => {
    expect(parseList('a, b , ,c')).toEqual(['a', 'b', 'c']);
    expect(parseList('')).toEqual([]);
  });

  it('parseItems membaca "nama, qty" per baris, qty default 1', () => {
    expect(parseItems('Golok Cordova, 2\nPisau Dapur')).toEqual([
      { name: 'Golok Cordova', qty: 2 },
      { name: 'Pisau Dapur', qty: 1 },
    ]);
    // Nama yang mengandung koma tidak boleh terpotong.
    expect(parseItems('Golok, Damaskus Edition, 3')).toEqual([{ name: 'Golok, Damaskus Edition', qty: 3 }]);
    expect(parseItems('\n  \n')).toEqual([]);
  });

  it('parseAliases membaca "dari = ke" per baris, kunci dinormalkan', () => {
    expect(parseAliases('Solo = Surakarta\n  UJUNG  PANDANG = makassar ')).toEqual({
      solo: 'Surakarta',
      'ujung pandang': 'makassar',
    });
    // Baris setengah jadi & baris kosong diabaikan diam-diam, bukan bikin error.
    expect(parseAliases('solo\n\n= kosong\njogja =')).toEqual({});
    // Nilai boleh mengandung "=" (walau aneh); pemisahnya yang PERTAMA.
    expect(parseAliases('a = b = c')).toEqual({ a: 'b = c' });
  });

  it('formatAliases bolak-balik tanpa kehilangan isi', () => {
    const map = { solo: 'surakarta', jogja: 'yogyakarta' };
    expect(parseAliases(formatAliases(map))).toEqual(map);
    expect(formatAliases({})).toBe('');
  });

  it('formatIdr memakai titik sebagai pemisah ribuan', () => {
    expect(formatIdr(152500)).toBe('152.500');
    expect(formatIdr(0)).toBe('0');
  });
});

describe('ShippingSettingsPage', () => {
  beforeEach(() => {
    apiMock.mockReset();
    mockApi();
  });

  // Pelajaran dari halaman Produk & Stok: hasRole() membaca localStorage saat
  // render, jadi kontrol khusus peran TIDAK BOLEH ada di render server.
  it('render server tidak memuat kontrol khusus peran (hydration aman)', () => {
    const html = renderToString(<ShippingSettingsPage />);
    expect(html).not.toContain('read-only mode');
  });

  it('memuat nilai config dari server, bukan angka bawaan di frontend', async () => {
    render(<ShippingSettingsPage />);
    expect((await screen.findByLabelText(/Origin ID/) as HTMLInputElement).value).toBe('origin-1');
    expect((screen.getByLabelText(/Couriers never offered/) as HTMLInputElement).value).toBe('paxel, SAPLite');
    expect((screen.getByLabelText(/No-COD region keywords/) as HTMLInputElement).value).toBe('papua, maluku');
    // TTL ditampilkan dalam jam walau server menyimpannya dalam milidetik.
    expect((screen.getByLabelText(/Quote cache lifetime/) as HTMLInputElement).value).toBe('6');
  });

  it('kunci API tidak pernah ditampilkan, hanya statusnya', async () => {
    render(<ShippingSettingsPage />);
    const key = (await screen.findByLabelText(/^API Key/)) as HTMLInputElement;
    expect(key.type).toBe('password');
    expect(key.value).toBe('');
    expect(screen.getByText(/leave blank to keep unchanged/)).toBeInTheDocument();
  });

  it('menyimpan: daftar dikirim sebagai array, jam dikonversi balik ke ms, kunci kosong tidak dikirim', async () => {
    render(<ShippingSettingsPage />);
    await screen.findByLabelText(/Origin ID/);
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => {
      const put = apiMock.mock.calls.find((c) => c[0] === '/settings' && c[1]?.method === 'PUT');
      expect(put).toBeTruthy();
      const body = JSON.parse(put![1].body).shipping;
      expect(body.courierExclude).toEqual(['paxel', 'SAPLite']);
      expect(body.quoteCacheTtlMs).toBe(21_600_000);
      expect(body.defaultWeightGrams).toBe(1000);
      // Kunci dibiarkan kosong → jangan sampai menimpa yang tersimpan.
      expect('mengantarApiKey' in body).toBe(false);
    });
  });

  it('kamus alias tampil sebagai teks & tersimpan sebagai objek', async () => {
    render(<ShippingSettingsPage />);
    const kotak = (await screen.findByLabelText(/Rewrite before searching/)) as HTMLTextAreaElement;
    expect(kotak.value).toBe('solo = surakarta\njogja = yogyakarta');

    fireEvent.change(kotak, { target: { value: 'solo = surakarta\nsby = surabaya' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => {
      const put = apiMock.mock.calls.find((c) => c[0] === '/settings' && c[1]?.method === 'PUT');
      expect(JSON.parse(put![1].body).shipping.destinationAliases).toEqual({
        solo: 'surakarta',
        sby: 'surabaya',
      });
    });
  });

  // Baris yang baru setengah diketik tidak boleh lenyap dari layar.
  it('baris tanpa "=" tetap terlihat selagi diketik', async () => {
    render(<ShippingSettingsPage />);
    const kotak = (await screen.findByLabelText(/Rewrite before searching/)) as HTMLTextAreaElement;
    fireEvent.change(kotak, { target: { value: 'solo = surakarta\nmalan' } });
    expect((screen.getByLabelText(/Rewrite before searching/) as HTMLTextAreaElement).value)
      .toBe('solo = surakarta\nmalan');
  });

  it('mengirim kunci baru hanya kalau kolomnya diisi', async () => {
    render(<ShippingSettingsPage />);
    const key = (await screen.findByLabelText(/^API Key/)) as HTMLInputElement;
    fireEvent.change(key, { target: { value: 'API-BARU' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => {
      const put = apiMock.mock.calls.find((c) => c[0] === '/settings' && c[1]?.method === 'PUT');
      expect(JSON.parse(put![1].body).shipping.mengantarApiKey).toBe('API-BARU');
    });
  });

  it('uji ongkir menampilkan kedua angka akhir + kurirnya', async () => {
    mockApi({
      quote: {
        status: 'ok',
        quote: {
          city: 'MEDAN', province: 'SUMATERA UTARA', weightKg: 2, goodsTotal: 300000,
          transferCourier: 'JNE', transferTotal: 394000,
          codCourier: 'lion', codTotal: 407000, codEligible: true,
        },
      },
    });
    render(<ShippingSettingsPage />);
    fireEvent.change(await screen.findByLabelText(/Destination city/), { target: { value: 'Medan' } });
    fireEvent.click(screen.getByRole('button', { name: /Calculate/ }));
    expect(await screen.findByText('MEDAN')).toBeInTheDocument();
    expect(screen.getByText(/394\.000/)).toBeInTheDocument();
    expect(screen.getByText(/407\.000/)).toBeInTheDocument();
    expect(screen.getByText('lion')).toBeInTheDocument();
  });

  it('hasil tanpa barang ditandai jelas sebagai ONGKIR saja', async () => {
    mockApi({
      quote: {
        status: 'ok',
        quote: {
          city: 'MAGETAN', province: 'JAWA TIMUR', weightKg: 1, goodsTotal: 0,
          transferCourier: 'JNE', transferTotal: 24000,
          codCourier: null, codTotal: null, codEligible: false, shippingOnly: true,
        },
      },
    });
    render(<ShippingSettingsPage />);
    fireEvent.change(await screen.findByLabelText(/Destination city/), { target: { value: 'Magetan' } });
    fireEvent.click(screen.getByRole('button', { name: /Calculate/ }));
    expect(await screen.findByText(/SHIPPING only/)).toBeInTheDocument();
    expect(screen.getByText(/24\.000/)).toBeInTheDocument();
  });

  it('status gagal dijelaskan dengan kalimat, bukan kode mentah', async () => {
    mockApi({ quote: { status: 'no_courier' } });
    render(<ShippingSettingsPage />);
    fireEvent.change(await screen.findByLabelText(/Destination city/), { target: { value: 'Medan' } });
    fireEvent.click(screen.getByRole('button', { name: /Calculate/ }));
    expect(await screen.findByText(/no courier passed the filter/i)).toBeInTheDocument();
  });

  it('kota ambigu menampilkan pilihannya, tanpa satu pun angka rupiah', async () => {
    mockApi({
      quote: {
        status: 'ambiguous',
        candidates: [
          { city: 'BOGOR', province: 'JAWA BARAT', label: 'Kota Bogor' },
          { city: 'BOGOR', province: 'JAWA BARAT', label: 'Kab. Bogor' },
        ],
      },
    });
    render(<ShippingSettingsPage />);
    fireEvent.change(await screen.findByLabelText(/Destination city/), { target: { value: 'Bogor' } });
    fireEvent.click(screen.getByRole('button', { name: /Calculate/ }));
    expect(await screen.findByText('Kota Bogor')).toBeInTheDocument();
    expect(screen.getByText('Kab. Bogor')).toBeInTheDocument();
    expect(screen.queryByText(/^Rp/)).not.toBeInTheDocument();
  });
});
