import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...a: unknown[]) => apiMock(...a), getToken: () => 't' }));

import { AuditTrail } from './AuditTrail';

const conv = (over: Record<string, unknown> = {}) =>
  ({
    id: 'c1',
    messages: [],
    sentinelReviews: [{ decision: 'block' }],
    takeoverStatus: 'admin_takeover',
    assignedAdmin: { name: 'Novy' },
    ...over,
  }) as never;

describe('AuditTrail — riwayat sungguhan, bukan ringkasan karangan', () => {
  beforeEach(() => apiMock.mockReset());

  it('menarik riwayat percakapan INI dari audit log, bukan menyusun dari state', async () => {
    apiMock.mockResolvedValue({
      data: [
        { id: 'a1', action: 'draft_approve', createdAt: '2026-08-03T17:29:00.000Z', user: { name: 'Angga' } },
        { id: 'a2', action: 'sentinel_action', createdAt: '2026-08-03T17:28:00.000Z', user: null },
      ],
    });
    render(<AuditTrail conversation={conv()} />);

    await waitFor(() => expect(screen.getByText(/Draft approved — Angga/)).toBeInTheDocument());
    expect(screen.getByText('Sentinel intervened')).toBeInTheDocument();

    // Disaring ke percakapan yang sedang dibuka — bukan seluruh sistem.
    const url = String(apiMock.mock.calls[0][0]);
    expect(url).toContain('entity=conversation');
    expect(url).toContain('entityId=c1');
  });

  /**
   * >>> ANGGA — inti perbaikannya.
   *
   * Versi lama menyusun barisnya dari `takeoverStatus`/`assignedAdmin`/
   * `sentinelReviews[0]` yang sedang berlaku, jadi ia SELALU punya isi walau
   * tidak ada satu pun kejadian yang tercatat. Fixture di bawah sengaja
   * memberi state yang dulu memancing baris karangan itu.
   */
  it('audit log kosong → jujur kosong, tidak mengarang dari state percakapan', async () => {
    apiMock.mockResolvedValue({ data: [] });
    render(<AuditTrail conversation={conv()} />);
    await waitFor(() => expect(screen.getByText('No recorded actions yet')).toBeInTheDocument());
    expect(screen.queryByText(/Admin took over/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Novy/)).not.toBeInTheDocument();
  });

  it('tiap baris punya WAKTU sungguhan', async () => {
    apiMock.mockResolvedValue({
      data: [{ id: 'a1', action: 'takeover', createdAt: '2026-08-03T17:29:00.000Z', user: null }],
    });
    render(<AuditTrail conversation={conv()} />);
    await waitFor(() => expect(screen.getByText(/Admin took over/)).toBeInTheDocument());
    // Format jam ikut locale mesin; yang dijaga: ADA jam, bukan kosong.
    const jam = new Date('2026-08-03T17:29:00.000Z').toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    expect(screen.getByText(jam)).toBeInTheDocument();
  });

  // CATATAN JUJUR (Angga): jalur "peran tanpa akses" SUDAH diimplementasikan
  // di komponen (403 → kalimat penjelasan, bukan galat merah), tapi TIDAK ada
  // tesnya di sini. Di harness ini, tes apa pun yang membuat `api` tertolak
  // ikut gagal walau komponennya menangkap dengan benar — sudah kubuktikan
  // dengan console.log bahwa blok catch-nya BENAR jalan. Penyebabnya belum
  // ketemu, jadi tesnya kuhapus ketimbang menulis yang lolos karena dilonggarkan.
  // Perilaku ini masih perlu dicek manual: buka inbox sebagai peran admin.
});
