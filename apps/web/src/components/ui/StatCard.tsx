import Link from 'next/link';
import { Card } from './Card';
import { cn } from '@/lib/cn';

export interface StatCardProps {
  label: string;
  value: number | string;
  tone?: string;
  href?: string;
}

export function StatCard({ label, value, tone, href }: StatCardProps) {
  const content = (
    <Card className={cn('p-3.5', href && 'cursor-pointer transition-colors hover:border-gray-300 dark:hover:border-gray-700')}>
      <p className={cn('text-2xl font-semibold tabular-nums', tone ?? 'text-gray-900 dark:text-gray-100')}>
        {value}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </Card>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }

  return content;
}
