import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

// The design language calls for Inter as the UI typeface. Load it here and
// expose it as a CSS variable so Tailwind's `font-sans` resolves to it
// (tailwind.config.ts references `var(--font-inter)`).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });


export const metadata: Metadata = {
  title: 'Hermes — AI Sales & Customer Service Control Center',
  description: 'Supervised, auditable AI operations center for multi-account WhatsApp.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint to avoid a flash. Light is default. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('hermes_theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
      </head>
      <body className="bg-gray-50 font-sans text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
        {children}
      </body>
    </html>
  );
}
