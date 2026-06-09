'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-gray-100">
      <section className="max-w-lg rounded-lg border border-red-900/60 bg-gray-900 p-6 shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-300">Application error</p>
        <h1 className="mt-2 text-2xl font-bold">Something went wrong</h1>
        <p className="mt-3 text-sm text-gray-400">
          The dashboard hit an unexpected error. The request can be retried safely.
        </p>
        <pre className="mt-4 max-h-40 overflow-auto rounded bg-black/40 p-3 text-xs text-gray-400">
          {error.message}
        </pre>
        <button
          onClick={reset}
          className="mt-5 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
