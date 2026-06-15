import { extractJson, parseJsonArray, parseJsonObject } from './learning.util';

describe('learning.util extractJson / parsers', () => {
  it('parses a plain JSON array', () => {
    expect(parseJsonArray('[{"title":"a"},{"title":"b"}]')).toHaveLength(2);
  });

  it('parses a plain JSON object', () => {
    expect(parseJsonObject('{"facts":["x","y"]}')).toEqual({ facts: ['x', 'y'] });
  });

  it('strips <think> reasoning blocks before the JSON', () => {
    const raw = '<think>let me reason about this {fake}</think>\n[{"title":"real"}]';
    expect(parseJsonArray(raw)).toEqual([{ title: 'real' }]);
  });

  it('unwraps a provider envelope that nests JSON in a "text" field', () => {
    const raw = JSON.stringify({ _type: 'response', _version: 3, text: '[{"title":"wrapped"}]' });
    expect(parseJsonArray(raw)).toEqual([{ title: 'wrapped' }]);
  });

  it('unwraps an object envelope for object parsing', () => {
    const raw = JSON.stringify({ output: '{"soulMd":"hi"}' });
    expect(parseJsonObject(raw)).toEqual({ soulMd: 'hi' });
  });

  it('extracts JSON from a ```json fenced block with prose around it', () => {
    const raw = 'Here you go:\n```json\n[{"title":"fenced"}]\n```\nThanks!';
    expect(parseJsonArray(raw)).toEqual([{ title: 'fenced' }]);
  });

  it('ignores prose surrounding a bare array', () => {
    expect(parseJsonArray('Sure! [{"a":1}] done')).toEqual([{ a: 1 }]);
  });

  it('returns {items:[...]} arrays via parseJsonArray', () => {
    expect(parseJsonArray('{"items":[{"t":1}]}')).toEqual([{ t: 1 }]);
  });

  it('throws on truncated JSON so callers can fall back to empty', () => {
    // A cut-off string is unrecoverable; the util surfaces the parse error.
    expect(() => parseJsonArray('[{"title":"unterminated')).toThrow();
  });

  it('does not recurse past depth 2 on nested envelopes', () => {
    // Deeply nested envelopes still resolve the inner array.
    const inner = '[{"title":"deep"}]';
    const raw = JSON.stringify({ text: JSON.stringify({ text: inner }) });
    expect(parseJsonArray(raw)).toEqual([{ title: 'deep' }]);
  });

  it('extractJson leaves a clean object untouched', () => {
    expect(extractJson('{"a":1}', '{')).toBe('{"a":1}');
  });
});
