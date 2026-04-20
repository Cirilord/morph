import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Midlane Next.js Example',
  description: 'A Midlane client running inside a Next.js app.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
