import * as React from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'review';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary:
    'bg-hermes-700 text-white hover:bg-hermes-800 border border-hermes-800 shadow-[0_1px_2px_rgba(30,41,59,0.08)]',
  outline:
    'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 border border-transparent dark:text-gray-300 dark:hover:bg-gray-800/60',
  danger:
    'bg-danger-600 text-white hover:bg-danger-700 border border-danger-700 shadow-[0_1px_2px_rgba(30,41,59,0.08)]',
  review:
    'bg-review-600 text-white hover:bg-review-700 border border-review-700',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded',
  md: 'h-9 px-4 text-[13px] gap-2 rounded',
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
        'focus-visible:outline-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
