'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

const controlBase =
  'w-full rounded border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none transition-colors ' +
  'placeholder:text-gray-400 focus:border-hermes-500 focus:bg-white focus:ring-2 focus:ring-hermes-500/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:bg-gray-800';

/**
 * Labelled form controls. The label is always associated with the control via a
 * generated id, so every input is reachable by `getByLabelText` and screen
 * readers. `hint` and `error` are wired through `aria-describedby`.
 */
interface BaseFieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

function FieldShell({
  label,
  hint,
  error,
  required,
  controlId,
  describedById,
  children,
}: BaseFieldProps & {
  controlId: string;
  describedById?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={controlId}
        className="block text-xs font-semibold text-gray-700 dark:text-gray-300"
      >
        {label}
        {required && <span className="ml-0.5 text-danger-600" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <p id={describedById} className="text-[11px] font-medium text-danger-600 dark:text-danger-400">
          {error}
        </p>
      ) : hint ? (
        <p id={describedById} className="text-[11px] text-gray-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface FieldProps
  extends BaseFieldProps,
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, error, required, className, ...props }, ref) => {
    const id = React.useId();
    const describedById = error || hint ? `${id}-desc` : undefined;
    return (
      <FieldShell
        label={label}
        hint={hint}
        error={error}
        required={required}
        controlId={id}
        describedById={describedById}
      >
        <input
          id={id}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          required={required}
          className={cn(controlBase, 'h-10', error && 'border-danger-300 focus:border-danger-500 focus:ring-danger-500/20', className)}
          {...props}
        />
      </FieldShell>
    );
  },
);
Field.displayName = 'Field';

export interface TextareaFieldProps
  extends BaseFieldProps,
    Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {}

export const TextareaField = React.forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ label, hint, error, required, className, rows = 4, ...props }, ref) => {
    const id = React.useId();
    const describedById = error || hint ? `${id}-desc` : undefined;
    return (
      <FieldShell
        label={label}
        hint={hint}
        error={error}
        required={required}
        controlId={id}
        describedById={describedById}
      >
        <textarea
          id={id}
          ref={ref}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          required={required}
          className={cn(controlBase, 'py-2 leading-6', error && 'border-danger-300 focus:border-danger-500 focus:ring-danger-500/20', className)}
          {...props}
        />
      </FieldShell>
    );
  },
);
TextareaField.displayName = 'TextareaField';

export interface SelectFieldProps
  extends BaseFieldProps,
    Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'id'> {}

export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, hint, error, required, className, children, ...props }, ref) => {
    const id = React.useId();
    const describedById = error || hint ? `${id}-desc` : undefined;
    return (
      <FieldShell
        label={label}
        hint={hint}
        error={error}
        required={required}
        controlId={id}
        describedById={describedById}
      >
        <select
          id={id}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          required={required}
          className={cn(controlBase, 'h-10', error && 'border-danger-300 focus:border-danger-500 focus:ring-danger-500/20', className)}
          {...props}
        >
          {children}
        </select>
      </FieldShell>
    );
  },
);
SelectField.displayName = 'SelectField';
