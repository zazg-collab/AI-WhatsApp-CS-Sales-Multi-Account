/**
 * >>> ANGGA — ekstraksi JSON dari keluaran LLM.
 *
 * MASALAH YANG DIPERBAIKI (insiden 2026-08-03): cara lama mengambil dari kurung
 * buka PERTAMA sampai kurung tutup TERAKHIR. Itu benar hanya selama model
 * berperilaku sempurna. Llama 3.3 70B lewat OpenRouter mengembalikan JSON yang
 * valid LALU menempelkan sampah di belakangnya — sebuah tag `</sai>` dan
 * salinan JSON yang sama sekali lagi:
 *
 *   {"segments":[...]}</sai>{{"segments":[...]}}
 *
 * Rentang "buka pertama → tutup terakhir" menelan semuanya, `JSON.parse` gagal,
 * dan balasan yang sebenarnya sudah benar di bagian pertama ikut terbuang.
 *
 * Pemindai di bawah menghitung kedalaman kurung (sadar tanda kutip & escape) dan
 * berhenti begitu objek PERTAMA tertutup sempurna. Apa pun sesudahnya diabaikan.
 * Bedanya mendasar: hasilnya benar secara konstruksi, bukan benar karena
 * kebetulan model tidak menambah apa-apa.
 *
 * `response_format: {type:'json_object'}` tetap dikirim di lapisan provider —
 * tapi terbukti tidak ditegakkan oleh semua kombinasi model/provider, jadi
 * ekstraksi ini TIDAK boleh mengandalkannya.
 */

/**
 * Kembalikan teks objek/array JSON LENGKAP pertama di dalam `raw`, atau null
 * kalau tidak ada yang tertutup sempurna.
 *
 * - Blok berpagar (```json … ```) diutamakan kalau ada.
 * - Kurung di dalam string (mis. `"balasan":"pakai {kurung} kak"`) tidak dihitung.
 * - Escape (`\"`, `\\`) ditangani supaya string tidak salah dianggap tertutup.
 */
export function extractFirstJson(raw: string, expected?: '{' | '['): string | null {
  const text = raw ?? '';
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const source = fenced ? fenced[1] : text;

  // `expected` dipakai pemanggil yang tahu bentuk yang diminta (mis. modul
  // Learning meminta array). Tanpa itu, ambil kurung mana pun yang muncul dulu.
  const start = expected ? source.indexOf(expected) : source.search(/[{[]/);
  if (start === -1) return null;

  const open = source[start];
  const close = open === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  // Tidak pernah tertutup — keluaran terpotong (mis. kena batas token).
  return null;
}

/**
 * `extractFirstJson` + `JSON.parse`, dikembalikan sebagai null kalau gagal.
 * Dipakai pemanggil yang memang ingin "gagal = tidak ada hasil", bukan lemparan.
 */
export function parseFirstJson<T = unknown>(raw: string): T | null {
  const slice = extractFirstJson(raw);
  if (slice === null) return null;
  try {
    return JSON.parse(slice) as T;
  } catch {
    return null;
  }
}
