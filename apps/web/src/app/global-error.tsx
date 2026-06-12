'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <main className="flex min-h-screen items-center justify-center p-6">
          <section className="max-w-lg rounded-lg border border-red-900/60 bg-gray-100 dark:bg-gray-900 p-6 shadow-xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-red-300">Critical error</p>
            <h1 className="mt-2 text-2xl font-bold">Dashboard crashed</h1>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              Please retry. If this keeps happening, share the error digest with engineering.
            </p>
            <pre className="mt-4 max-h-40 overflow-auto rounded bg-black/10 dark:bg-black/40 p-3 text-xs text-gray-600 dark:text-gray-400">
              {error.digest ?? error.message}
            </pre>
            <button
              onClick={reset}
              className="mt-5 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Reload dashboard
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
