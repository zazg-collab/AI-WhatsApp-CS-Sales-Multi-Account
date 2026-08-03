'use client';

import { useEffect, useState } from 'react';
import { hasRole } from './api';

/**
 * >>> ANGGA
 * Versi `hasRole()` yang aman dari hydration mismatch.
 *
 * MASALAHNYA: `hasRole()` men-decode JWT dari penyimpanan browser. Di server
 * token itu tidak ada, jadi server merender versi "tidak boleh edit" sementara
 * browser merender versi "boleh edit" — React lalu melempar
 * "Hydration failed because the initial UI does not match what was rendered on
 * the server". Ini bawaan upstream, terlihat di `/settings/ai` yang merender
 * spanduk read-only DI LUAR cabang loading (halaman lain kebetulan tidak kena
 * karena elemen yang bergantung peran ada di dalam cabang `!data`).
 *
 * SOLUSINYA: render pertama SELALU `allowed:false` di kedua sisi supaya cocok,
 * baru peran sungguhan dibaca sesudah komponen ter-mount. `ready` dipakai untuk
 * menahan elemen yang bergantung peran agar tidak berkedip sekejap sebelum
 * peran diketahui.
 *
 * File BARU — sengaja, supaya tidak pernah bentrok saat merge dari upstream.
 */
export function useHasRole(required: string): { allowed: boolean; ready: boolean } {
  const [state, setState] = useState({ allowed: false, ready: false });

  useEffect(() => {
    setState({ allowed: hasRole(required), ready: true });
  }, [required]);

  return state;
}
