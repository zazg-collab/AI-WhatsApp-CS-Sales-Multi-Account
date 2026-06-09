import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hermes Control Center',
  description: 'AI WhatsApp CS & Sales Multi-Account',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="bg-wa-bg text-gray-100 antialiased">{children}</body>
    </html>
  );
}
