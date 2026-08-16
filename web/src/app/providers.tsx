'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { SocketProvider } from '@/lib/socket';
import { CartProvider } from '@/lib/cart';
import { I18nProvider } from '@/lib/i18n';
import { ToastProvider } from '@/components/Toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <CartProvider>{children}</CartProvider>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
