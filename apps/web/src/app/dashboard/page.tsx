import { redirect } from 'next/navigation';

// Legacy dashboard route — the full inbox is now at /inbox.
export default function DashboardPage() {
  redirect('/inbox');
}
