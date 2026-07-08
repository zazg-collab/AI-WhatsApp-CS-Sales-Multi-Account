import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Sentinel · Supervised WhatsApp Sales & CS',
  description: 'Run every WhatsApp Sales and CS account from one dashboard. AI replies automatically, Sentinel reviews every risky message before it sends, and your team takes over anytime.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme + language before first paint to avoid a flash. English/light are the defaults. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('sentinel_theme')==='dark')document.documentElement.classList.add('dark');var l=localStorage.getItem('sentinel_lang');document.documentElement.lang=(l==='id'||l==='en')?l:'en'}catch(e){}",
          }}
        />
      </head>
      <body className="bg-gray-50 font-sans text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
