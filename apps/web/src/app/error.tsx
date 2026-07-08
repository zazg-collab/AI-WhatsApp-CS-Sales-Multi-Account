'use client';

import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  errorOccurred: { id: 'Terjadi error', en: 'An error occurred' },
  somethingWrong: { id: 'Ada yang tidak beres', en: 'Something went wrong' },
  errorBody: {
    id: 'Dashboard mengalami error tak terduga. Anda bisa mencoba ulang dengan aman tanpa kehilangan data.',
    en: 'The dashboard hit an unexpected error. You can safely retry without losing any data.',
  },
  tryAgain: { id: 'Coba lagi', en: 'Try again' },
};

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT(dict);
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <section className="max-w-lg rounded-xl border border-danger-200 bg-white p-6 shadow-pop dark:border-danger-700/40 dark:bg-gray-900">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-danger-600 dark:text-danger-400">{t('errorOccurred')}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t('somethingWrong')}</h1>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          {t('errorBody')}
        </p>
        <pre className="mt-4 max-h-40 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          {error.message}
        </pre>
        <button
          onClick={reset}
          className="mt-5 rounded border border-hermes-800 bg-hermes-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-hermes-800"
        >
          {t('tryAgain')}
        </button>
      </section>
    </main>
  );
}
