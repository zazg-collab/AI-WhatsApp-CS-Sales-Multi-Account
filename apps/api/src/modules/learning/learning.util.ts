import { extractFirstJson } from '../../common/json-extract.util'; // >>> ANGGA <<<

/**
 * Extract a JSON document from a raw LLM response. Robust to the things real
 * providers do around the answer:
 *  - reasoning models emit <think>…</think> chain-of-thought,
 *  - some wrap the answer in an envelope like {"text":"[ ...json... ]"},
 *  - code fences ```json … ```,
 *  - prose before/after the JSON.
 *
 * `open` is the expected opening bracket of the payload ('{' or '['). Returns
 * a best-effort JSON substring; callers still JSON.parse() and handle failure.
 */
export function extractJson(raw: string, open: '{' | '[' = '{', depth = 0): string {
  let s = raw ?? '';
  // Drop reasoning/thinking blocks (closed or stray tags).
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
  s = s.replace(/<\/?(?:think|reasoning|thought)>/gi, '');

  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();

  // Unwrap provider envelopes, e.g. {"_type":"response","text":"[...]"}.
  if (depth < 2) {
    try {
      const env = JSON.parse(s.trim());
      if (env && typeof env === 'object' && !Array.isArray(env)) {
        for (const k of ['text', 'content', 'output', 'response', 'result', 'message']) {
          if (typeof env[k] === 'string' && env[k].includes(open)) {
            return extractJson(env[k], open, depth + 1);
          }
        }
      }
    } catch {
      // not a clean envelope — fall through to brace slicing
    }
  }

  // >>> ANGGA: dulu "kurung buka pertama sampai kurung tutup TERAKHIR" — cacat
  // yang sama persis dengan yang meledak di `ai.service.ts` 2026-08-03: begitu
  // model menempelkan sesuatu setelah JSON-nya (sampah, atau salinan kedua
  // jawaban yang sama), potongan itu ikut tertelan dan parse gagal total.
  // Pengupasan <think>/envelope di atas tetap dipertahankan — yang diganti
  // hanya cara memotongnya, sekarang lewat pemindai kedalaman kurung bersama.
  return extractFirstJson(s, open) ?? s.trim();
  // <<< ANGGA
}

/** Parse an LLM response expected to contain a JSON array. Never throws. */
export function parseJsonArray(raw: string): Array<Record<string, unknown>> {
  const json = JSON.parse(extractJson(raw, '['));
  if (Array.isArray(json)) return json;
  if (Array.isArray((json as { items?: unknown })?.items)) {
    return (json as { items: Array<Record<string, unknown>> }).items;
  }
  return [];
}

/** Parse an LLM response expected to contain a JSON object. Never throws here. */
export function parseJsonObject(raw: string): Record<string, unknown> {
  return JSON.parse(extractJson(raw, '{'));
}
