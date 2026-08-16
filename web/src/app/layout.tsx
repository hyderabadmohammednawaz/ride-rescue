import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'RideRescue — Two-Wheeler Service & Spare Parts',
  description:
    'Real-time location-based two-wheeler breakdown assistance, doorstep servicing and spare parts marketplace.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applied before paint so a dark-mode reload never flashes white. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('riderescue.theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
