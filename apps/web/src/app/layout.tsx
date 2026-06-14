import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import './globals.css';


export const metadata: Metadata = {
  title: 'Hermes — Sales & CS Control Desk',
  description: 'Pusat operasi AI yang tersupervisi dan terlacak untuk banyak akun WhatsApp.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={GeistMono.variable} suppressHydrationWarning>
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
