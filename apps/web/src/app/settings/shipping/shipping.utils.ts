/**
 * >>> ANGGA — pembantu murni untuk halaman /settings/shipping.
 *
 * DIPINDAH KE SINI dari `page.tsx` (2026-08-04). Next.js App Router hanya
 * mengizinkan sekumpulan named export tertentu dari sebuah berkas `page.tsx`
 * (metadata, generateMetadata, dynamic, revalidate, dst). Fungsi bantu yang
 * di-export dari situ membuat `next build` gagal:
 *
 *   Type error: Page "src/app/settings/shipping/page.tsx" does not match the
 *   required types of a Next.js Page.  "parseList" is not a valid Page export field.
 *
 * Tidak ketahuan berbulan-bulan karena `tsc --noEmit` dan vitest TIDAK
 * menerapkan aturan khusus Next itu — hanya `next build` yang menegakkannya,
 * dan build produksi tidak pernah dijalankan dari sandbox.
 *
 * Berkas biasa di dalam folder `app/` aman: Next hanya memperlakukan nama
 * khusus (page/layout/route/…) sebagai rute.
 */

/** "a, b , ,c" → ["a","b","c"]. Entri kosong dibuang, bukan dikirim sebagai "". */
export function parseList(raw: string): string[] {
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

/** "Golok Cordova, 2\nPisau, 1" → [{name,qty}]. qty default 1 kalau tidak wajar. */
export function parseItems(raw: string): Array<{ name: string; qty: number }> {
  return raw
    .split('\n')
    .map((line) => {
      const parts = line.split(',');
      const qtyRaw = parts.length > 1 ? Number(parts.pop()) : NaN;
      const name = parts.join(',').trim();
      if (!name) return null;
      return { name, qty: Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1 };
    })
    .filter((x): x is { name: string; qty: number } => x !== null);
}

/**
 * >>> ANGGA — kamus alias sebagai teks biasa, satu baris per nama:
 *   `solo = surakarta`
 * Dipilih ketimbang tabel dua kolom karena isinya sering ditempel sekaligus
 * dari catatan, dan baris tanpa `=` cukup diabaikan diam-diam saat mengetik
 * (jangan sampai baris setengah jadi menghapus baris lain).
 */
export function parseAliases(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const baris of raw.split('\n')) {
    const i = baris.indexOf('=');
    if (i <= 0) continue;
    const dari = baris.slice(0, i).trim().toLowerCase().replace(/\s+/g, ' ');
    const ke = baris.slice(i + 1).trim();
    if (dari && ke) out[dari] = ke;
  }
  return out;
}

export function formatAliases(map: Record<string, string>): string {
  return Object.entries(map ?? {})
    .map(([dari, ke]) => `${dari} = ${ke}`)
    .join('\n');
}

export function formatIdr(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
