import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
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
    <html lang="id" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint to avoid a flash.
            Light is the default; "dark" opts into the WhatsApp-night look. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('hermes_theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
      </head>
      <body className="bg-gray-50 font-sans text-gray-900 antialiased dark:bg-wa-bg dark:text-gray-100">
        {children}
      </body>
    </html>
  );
}
