'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth, HOME_BY_ROLE } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useI18n, LANGUAGES, type TranslationKey } from '@/lib/i18n';
import { useSocket } from '@/lib/socket';
import { NotificationBell } from './NotificationBell';
import { Chatbot } from './Chatbot';
import { Spinner } from './ui';
import type { Role } from '@/lib/types';

/**
 * Nav items carry a translation key rather than a label. They used to hold
 * English strings, so switching language changed the stored preference and
 * nothing on screen — the picker looked broken while the dictionary sat unused.
 */
interface NavItem {
  href: string;
  key: TranslationKey;
  icon: string;
}

const NAV: Record<Role, NavItem[]> = {
  customer: [
    { href: '/customer', key: 'nav.home', icon: '🏠' },
    { href: '/customer/bookings', key: 'nav.bookings', icon: '🔧' },
    { href: '/customer/store', key: 'nav.store', icon: '🛒' },
    { href: '/customer/orders', key: 'nav.orders', icon: '📦' },
    { href: '/customer/profile', key: 'nav.profile', icon: '👤' },
  ],
  mechanic: [
    { href: '/mechanic', key: 'nav.dashboard', icon: '📊' },
    { href: '/mechanic/jobs', key: 'nav.openJobs', icon: '🔧' },
    { href: '/mechanic/earnings', key: 'nav.earnings', icon: '💰' },
    { href: '/mechanic/history', key: 'nav.history', icon: '📜' },
    { href: '/mechanic/profile', key: 'nav.profile', icon: '👤' },
  ],
  vendor: [
    { href: '/vendor', key: 'nav.dashboard', icon: '📊' },
    { href: '/vendor/products', key: 'nav.products', icon: '🔩' },
    { href: '/vendor/inventory', key: 'nav.inventory', icon: '📋' },
    { href: '/vendor/orders', key: 'nav.orders', icon: '📦' },
  ],
  admin: [
    { href: '/admin', key: 'nav.dashboard', icon: '📊' },
    { href: '/admin/users', key: 'nav.users', icon: '👥' },
    // Not nav.bookings: that reads "My Bookings", which is wrong for an admin
    // looking at everyone's.
    { href: '/admin/bookings', key: 'nav.allBookings', icon: '🔧' },
    { href: '/admin/reports', key: 'nav.reports', icon: '📈' },
    { href: '/admin/complaints', key: 'nav.complaints', icon: '⚠️' },
  ],
};

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('riderescue.theme', next ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggle}
      className="rounded-xl p-2 text-lg transition hover:bg-slate-100 dark:hover:bg-slate-800"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}

function LanguagePicker() {
  const { lang, setLang } = useI18n();
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value as any)}
      className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
      aria-label="Language"
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { t } = useI18n();
  const { count } = useCart();
  const { connected } = useSocket();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== role) router.replace(HOME_BY_ROLE[user.role]);
  }, [user, loading, role, router]);

  if (loading || !user || user.role !== role) return <Spinner label="Checking your session…" />;

  const items = NAV[role];
  const isActive = (href: string) => pathname === href || (href !== HOME_BY_ROLE[role] && pathname.startsWith(href));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 no-print">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href={HOME_BY_ROLE[role]} className="flex shrink-0 items-center gap-2">
            <span className="text-2xl">🏍️</span>
            <span className="text-lg font-extrabold tracking-tight">
              Ride<span className="text-brand-600 dark:text-brand-400">Rescue</span>
            </span>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 lg:flex">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive(item.href)
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <span className="mr-1.5">{item.icon}</span>
                {t(item.key)}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <span
              title={connected ? 'Live connection active' : 'Reconnecting…'}
              className={`hidden h-2 w-2 rounded-full sm:block ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
            {role === 'customer' && (
              <Link
                href="/customer/cart"
                className="relative rounded-xl p-2 text-lg transition hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label={`Cart, ${count} items`}
              >
                🛒
                {count > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                    {count}
                  </span>
                )}
              </Link>
            )}
            <NotificationBell />
            <div className="hidden sm:block">
              <LanguagePicker />
            </div>
            <ThemeToggle />

            <div className="ml-1 hidden items-center gap-2 border-l border-slate-200 pl-3 dark:border-slate-800 sm:flex">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: user.avatarColor || '#2563eb' }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-semibold leading-tight">{user.name}</p>
                <p className="text-[11px] capitalize text-slate-500 dark:text-slate-400">{user.role}</p>
              </div>
              <button onClick={logout} className="btn-ghost px-2 py-1 text-xs" title={t('nav.logout')}>
                {t('nav.logout')}
              </button>
            </div>

            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded-xl p-2 text-lg lg:hidden"
              aria-label="Menu"
            >
              ☰
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="border-t border-slate-200 px-4 py-2 lg:hidden dark:border-slate-800">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`block rounded-xl px-3 py-2.5 text-sm font-medium ${
                  isActive(item.href) ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' : ''
                }`}
              >
                <span className="mr-2">{item.icon}</span>
                {t(item.key)}
              </Link>
            ))}
            <button onClick={logout} className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600">
              <span className="mr-2">🚪</span>
              {t('nav.logout')}
            </button>

            {/* The picker is hidden on small screens in the header bar, so the
                mobile menu is the only way to change language on a phone. */}
            <div className="mt-2 border-t border-slate-200 pt-3 sm:hidden dark:border-slate-800">
              <LanguagePicker />
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

      {role === 'customer' && <Chatbot />}
    </div>
  );
}
