import * as React from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'review';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary:
    'border border-hermes-700 bg-hermes-700 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-hermes-800',
  outline:
    'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 border border-transparent dark:text-gray-300 dark:hover:bg-gray-800/60',
  danger:
    'border border-danger-700 bg-danger-600 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-danger-700',
  review:
    'border border-review-700 bg-review-600 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:bg-review-700',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-[13px] gap-2 rounded-lg',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-150',
        'focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
