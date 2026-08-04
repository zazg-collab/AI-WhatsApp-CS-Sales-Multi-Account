import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraftControls } from './DraftControls';
import type { Message } from '../inbox.types';

function makeDraft(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    senderType: 'ai',
    content: 'Halo kak, ini balasan draft dari AI.',
    messageType: 'text',
    status: 'pending',
    aiGenerated: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('DraftControls', () => {
  it('renders nothing when there are no AI-generated drafts', () => {
    const { container } = render(
      <DraftControls draftMessages={[makeDraft({ aiGenerated: false })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a single draft with its content', () => {
    render(<DraftControls draftMessages={[makeDraft()]} />);
    expect(screen.getByText('Halo kak, ini balasan draft dari AI.')).toBeInTheDocument();
  });

  it('calls onApprove with the draft id when Approve is clicked', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(<DraftControls draftMessages={[makeDraft({ id: 'm42' })]} onApprove={onApprove} />);
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledWith('m42');
  });

  it('calls onBlock with the draft id when Block is clicked', async () => {
    const onBlock = vi.fn().mockResolvedValue(undefined);
    render(<DraftControls draftMessages={[makeDraft({ id: 'm42' })]} onBlock={onBlock} />);
    await userEvent.click(screen.getByRole('button', { name: /block/i }));
    expect(onBlock).toHaveBeenCalledWith('m42');
  });

  it('calls onEdit with the draft id when Edit is clicked', async () => {
    const onEdit = vi.fn();
    render(<DraftControls draftMessages={[makeDraft({ id: 'm42' })]} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith('m42');
  });

  it('disables all action buttons while approving or blocking is in flight', () => {
    render(<DraftControls draftMessages={[makeDraft()]} approving />);
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /block/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /edit/i })).toBeDisabled();
  });

  it('shows an "approve all" shortcut only when there is more than one draft', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <DraftControls
        draftMessages={[makeDraft({ id: 'm1' }), makeDraft({ id: 'm2' })]}
        onApprove={onApprove}
      />,
    );
    const approveAll = screen.getByText(/approve all/i);
    await userEvent.click(approveAll);
    expect(onApprove).toHaveBeenCalledWith('m1');
    expect(onApprove).toHaveBeenCalledWith('m2');
    expect(onApprove).toHaveBeenCalledTimes(2);
  });

  it('does not show the "approve all" shortcut for a single draft', () => {
    render(<DraftControls draftMessages={[makeDraft()]} onApprove={vi.fn()} />);
    expect(screen.queryByText(/approve all/i)).not.toBeInTheDocument();
  });

  // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): dulu alasan penahanan
  // gerbang uang ("⚠️ [gerbang uang menahan: ...]") ikut ditulis LANGSUNG ke
  // dalam content draft — klik Approve tanpa Edit dulu mengirim teks debug
  // internal itu apa adanya ke pelanggan. Sekarang content selalu bersih dan
  // alasannya tampil di kartu terpisah, Approve dimatikan sampai di-Edit.
  it('keeps the draft bubble clean of the money-gate prefix and shows it as a separate warning card', () => {
    render(
      <DraftControls
        draftMessages={[
          makeDraft({
            content: 'Bedog Betekok harganya Rp139.000, kak.',
            moneyGateIssues: ['Angka rupiah ditulis langsung oleh model, bukan lewat penanda: 139000'],
          }),
        ]}
      />,
    );
    expect(screen.getByText('Bedog Betekok harganya Rp139.000, kak.')).toBeInTheDocument();
    expect(screen.queryByText(/⚠️ \[gerbang uang menahan/)).not.toBeInTheDocument();
    expect(
      screen.getByText('Angka rupiah ditulis langsung oleh model, bukan lewat penanda: 139000'),
    ).toBeInTheDocument();
  });

  it('disables Approve (forces Edit first) for a draft the money gate is holding', () => {
    render(
      <DraftControls
        draftMessages={[makeDraft({ moneyGateIssues: ['Angka rupiah ditulis langsung'] })]}
        onApprove={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /edit/i })).not.toBeDisabled();
  });

  it('does not render the money-gate warning card for an ungated draft', () => {
    render(<DraftControls draftMessages={[makeDraft()]} />);
    expect(screen.getByRole('button', { name: /approve/i })).not.toBeDisabled();
  });

  it('"approve all" skips drafts the money gate is holding, even when mixed with clean drafts', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <DraftControls
        draftMessages={[
          makeDraft({ id: 'clean1' }),
          makeDraft({ id: 'gated1', moneyGateIssues: ['Angka rupiah ditulis langsung'] }),
        ]}
        onApprove={onApprove}
      />,
    );
    await userEvent.click(screen.getByText(/approve all/i));
    expect(onApprove).toHaveBeenCalledWith('clean1');
    expect(onApprove).not.toHaveBeenCalledWith('gated1');
    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});
