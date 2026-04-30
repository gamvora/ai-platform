import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/Toast';

export const metadata: Metadata = {
  title: 'Nova AI — Chat, Images & Video',
  description:
    'A premium AI platform. Chat with AI, generate images and videos, all in one beautifully crafted dark-mode experience.',
  keywords: ['AI', 'ChatGPT', 'Image Generation', 'Video Generation', 'Blackbox AI'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-ambient">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
