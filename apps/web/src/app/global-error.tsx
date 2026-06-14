'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body className="bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <main className="flex min-h-screen items-center justify-center p-6">
          <section className="max-w-lg rounded-xl border border-danger-200 bg-white p-6 shadow-pop dark:border-danger-700/40 dark:bg-gray-900">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-danger-600 dark:text-danger-400">Error kritis</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Dashboard berhenti tak terduga</h1>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              Silakan muat ulang. Jika terus terjadi, kirim kode digest error di bawah ke tim engineering.
            </p>
            <pre className="mt-4 max-h-40 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              {error.digest ?? error.message}
            </pre>
            <button
              onClick={reset}
              className="mt-5 rounded border border-hermes-800 bg-hermes-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-hermes-800"
            >
              Muat ulang dashboard
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
