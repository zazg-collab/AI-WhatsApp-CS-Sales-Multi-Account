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
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint to avoid a flash.
            Light is the default; "dark" opts into the old dark look. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('hermes_theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
      </head>
      <body className="bg-[#F7F6F3] text-gray-900 antialiased dark:bg-wa-bg dark:text-gray-100">
        {children}
      </body>
    </html>
  );
}
