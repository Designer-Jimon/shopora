import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SHOPORA — Build. Sell. Grow.',
    template: '%s | SHOPORA',
  },
  description:
    'SHOPORA is a multi-tenant e-commerce platform for Nigerian and African businesses. Build your store, sell your products, grow your business.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#722F37',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}