import * as React from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'review';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  // Primary = Hermes indigo — the AI / commit action.
  primary:
    'bg-hermes-600 text-white hover:bg-hermes-700 border border-transparent shadow-card',
  outline:
    'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 border border-transparent dark:text-gray-300 dark:hover:bg-gray-800',
  danger:
    'bg-danger-600 text-white hover:bg-danger-700 border border-transparent',
  review:
    'bg-review-600 text-white hover:bg-review-700 border border-transparent',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
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
        'inline-flex items-center justify-center font-medium transition-colors',
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
