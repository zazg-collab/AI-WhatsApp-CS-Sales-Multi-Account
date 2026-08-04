import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

const hasRoleMock = vi.fn(() => true);
vi.mock('@/lib/api', () => ({
  hasRole: (r: string) => hasRoleMock(r as never),
  getToken: () => 't',
}));

import { AiModeControl } from './AiModeControl';

const conv = (aiMode: string) => ({ id: 'c1', aiMode }) as never;

describe('AiModeControl — jalan keluar dari AI paused', () => {
  beforeEach(() => {
    hasRoleMock.mockReset();
    hasRoleMock.mockReturnValue(true);
  });

  /**
   * >>> ANGGA — regresi jalan buntu 2026-08-03.
   *
   * Sentinel menjeda AI (`ai_paused`), lalu SELURUH radio dimatikan dengan
   * pesan "Contact admin to resume". Admin membuka layar yang sama dan tetap
   * tidak bisa klik apa pun; menu "Return to AI" juga tidak muncul karena
   * ia bergantung `takeoverStatus === 'admin_takeover'`, sementara Sentinel
   * menyetel `waiting_admin`. Satu-satunya jalan keluar dulu adalah curl.
   */
  it('admin BISA memilih mode lain walau sedang dijeda', async () => {
    const onSetMode = vi.fn().mockResolvedValue(undefined);
    render(<AiModeControl conversation={conv('ai_paused')} onSetMode={onSetMode} />);

    const draft = await screen.findByRole('radio', { name: /AI Draft/ });
    await waitFor(() => expect(draft).toBeEnabled());
    fireEvent.click(draft);
    expect(onSetMode).toHaveBeenCalledWith('ai_draft');
  });

  it('keadaan dijeda punya barisnya sendiri, terpilih tapi tidak bisa diklik', async () => {
    render(<AiModeControl conversation={conv('ai_paused')} />);
    const jeda = await screen.findByRole('radio', { name: /AI Paused/ });
    expect(jeda).toBeChecked();
    // Menjeda AI itu keputusan Sentinel — tidak boleh jadi pilihan manual.
    expect(jeda).toBeDisabled();
    expect(screen.getByText(/pick another mode to resume/i)).toBeInTheDocument();
  });

  it('baris "AI Paused" tidak muncul kalau memang tidak dijeda', () => {
    render(<AiModeControl conversation={conv('ai_draft')} />);
    expect(screen.queryByRole('radio', { name: /AI Paused/ })).not.toBeInTheDocument();
  });

  it('peran di bawah admin tetap terkunci + tetap diberi tahu harus menghubungi siapa', async () => {
    hasRoleMock.mockReturnValue(false);
    render(<AiModeControl conversation={conv('ai_paused')} />);
    expect(await screen.findByText(/Contact admin to resume/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /AI Draft/ })).toBeDisabled();
  });

  // Pelajaran dari halaman Produk & Stok: peran dibaca dari localStorage, jadi
  // render server TIDAK BOLEH memuat elemen yang bergantung peran.
  it('render server tidak memuat spanduk khusus peran (hydration aman)', () => {
    const html = renderToString(<AiModeControl conversation={conv('ai_paused')} />);
    expect(html).not.toContain('Contact admin to resume');
    // Keadaan jeda tetap terlihat sejak render pertama — ia tidak bergantung peran.
    expect(html).toContain('AI Paused');
  });
});
