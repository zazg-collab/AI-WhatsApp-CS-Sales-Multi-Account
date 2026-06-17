import Link from 'next/link';
import { type Icon as PhosphorIcon } from '@phosphor-icons/react';
import { Card } from './Card';
import { Button } from './Button';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon: PhosphorIcon;
  title: string;
  hint: string;
  action?: {
    label: string;
    href: string;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, hint, action, className }: EmptyStateProps) {
  return (
    <Card className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <Icon className="mb-2 h-6 w-6 text-gray-300" aria-hidden="true" />
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
      <p className="mt-1 text-[13px] text-gray-400">{hint}</p>
      {action && (
        <Link href={action.href}>
          <Button variant="outline" size="sm" className="mt-3">
            {action.label}
          </Button>
        </Link>
      )}
    </Card>
  );
}
