import {
  DATA_FENCE_OPEN,
  DATA_FENCE_CLOSE,
  fenceData,
  stripDataFences,
} from './bot-prompts';

describe('stripDataFences', () => {
  it('removes both id and en fence markers a model might echo', () => {
    const leaked = `${DATA_FENCE_OPEN.id}\nHarga 100rb\n${DATA_FENCE_CLOSE.id}`;
    expect(stripDataFences(leaked)).toBe('Harga 100rb');

    const leakedEn = `${DATA_FENCE_OPEN.en} Price is $5 ${DATA_FENCE_CLOSE.en}`;
    expect(stripDataFences(leakedEn)).toBe('Price is $5');
  });

  it('strips markers produced by fenceData', () => {
    const out = stripDataFences(fenceData('stock 3', 'id'));
    expect(out).toBe('stock 3');
    expect(out).not.toMatch(/<</);
  });

  it('leaves normal replies untouched', () => {
    const reply = 'Halo kak, stok ready. Mau pesan berapa?';
    expect(stripDataFences(reply)).toBe(reply);
  });

  it('handles empty/undefined', () => {
    expect(stripDataFences('')).toBe('');
    expect(stripDataFences(undefined as unknown as string)).toBe('');
  });
});
