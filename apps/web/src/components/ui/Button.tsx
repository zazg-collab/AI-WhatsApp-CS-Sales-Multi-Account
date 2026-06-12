import * as React from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'review';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-hermes-500 to-hermes-700 text-white hover:from-hermes-400 hover:to-hermes-600 border border-hermes-700/40 shadow-[0_1px_3px_rgba(79,70,229,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]',
  outline:
    'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 border border-transparent dark:text-gray-300 dark:hover:bg-gray-800/60',
  danger:
    'bg-gradient-to-b from-danger-500 to-danger-700 text-white hover:from-danger-400 hover:to-danger-600 border border-danger-700/40 shadow-[0_1px_2px_rgba(220,38,38,0.3)]',
  review:
    'bg-gradient-to-b from-review-500 to-review-600 text-white hover:from-review-400 hover:to-review-500 border border-review-700/40',
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
