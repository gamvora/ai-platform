import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { ToastProvider } from '@/components/Toast';

export const metadata: Metadata = {
  title: 'Nova AI — Chat, Images & Video',
  description:
    'A premium AI platform. Chat with AI, generate images and videos, all in one beautifully crafted dark-mode experience.',
  keywords: ['AI', 'ChatGPT', 'Image Generation', 'Video Generation', 'Blackbox AI'],
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    viewportFit: 'cover',
  },
};

function getLocale(): 'ar' | 'en' {
  const v = cookies().get('locale')?.value;
  return v === 'en' ? 'en' : 'ar';
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = getLocale();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-ambient" style={{ minHeight: '100dvh' }}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
