import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#1B1D21',
};

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mortal-mesh.vercel.app'
).replace(/\/$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Mortal Mesh — 3D Anatomy Studio & Drawing Pad',
    template: '%s | Mortal Mesh',
  },
  description:
    'Offline-ready 3D rigged mannequin, live two-bone IK, and figure-posing reference studio for artists.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Mortal Mesh',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mortal Mesh',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh] bg-[#686E78] font-sans text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
