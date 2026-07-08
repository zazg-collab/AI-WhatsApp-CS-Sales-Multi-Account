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
});
