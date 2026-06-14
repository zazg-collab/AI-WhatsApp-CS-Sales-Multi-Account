'use client';

import * as React from 'react';

/** Shared control styling so inputs/selects/textareas look identical everywhere. */
export const fieldControl =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

/**
 * Labelled form field. Generates a stable id and passes it to the control via
 * render-prop so the `<label htmlFor>` is programmatically associated with the
 * input — screen readers announce the label, and clicking it focuses the field
 * (WCAG 1.3.1 / 3.3.2). Use as:
 *
 *   <Field label="Email">{(id) => <input id={id} className={fieldControl} />}</Field>
 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}
