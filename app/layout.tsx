import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server';
import Script from 'next/script';
import ConvexClientProvider from '@/components/providers/ConvexClientProvider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter'
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains'
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk'
});

export const metadata = {
  title: 'SF Trip Planner',
  description: 'See what is happening in SF, what is nearby, and how long it takes from your stay.',
  metadataBase: new URL('https://sf.ianhsiao.me'),
  openGraph: {
    title: 'SF Travel Planner',
    description: 'Events, spots, and safety — one map. Plan your SF trip free.',
    siteName: 'SF Travel Planner',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SF Travel Planner',
    description: 'Events, spots, and safety — one map. Plan your SF trip free.',
    creator: '@ianhsiao',
  },
};

export default function RootLayout({ children }) {
  const buyMeACoffeeId = (process.env.NEXT_PUBLIC_BUYMEACOFFEE_ID || '').trim();

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}`}>
      <body>
        <ConvexAuthNextjsServerProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ConvexAuthNextjsServerProvider>
        <Analytics />
        {buyMeACoffeeId ? (
          <Script
            id="buymeacoffee-widget"
            src="https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js"
            strategy="afterInteractive"
            data-name="BMC-Widget"
            data-cfasync="false"
            data-id={buyMeACoffeeId}
            data-description="Support this project on Buy Me a Coffee"
            data-message=""
            data-color="#00FF88"
            data-position="Right"
            data-x_margin="18"
            data-y_margin="18"
          />
        ) : null}
      </body>
    </html>
  );
}
