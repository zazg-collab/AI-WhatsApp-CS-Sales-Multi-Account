'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <section className="max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.18)] dark:border-gray-800 dark:bg-gray-900">
        <p className="text-sm font-semibold uppercase tracking-wide text-danger-600 dark:text-danger-400">Application error</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          The dashboard hit an unexpected error. The request can be retried safely.
        </p>
        <pre className="mt-4 max-h-40 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-600 dark:bg-black/40 dark:text-gray-400">
          {error.message}
        </pre>
        <button
          onClick={reset}
          className="mt-5 rounded border border-hermes-800 bg-hermes-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-hermes-800"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
