'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth, HOME_BY_ROLE } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useI18n, LANGUAGES } from '@/lib/i18n';
import { useSocket } from '@/lib/socket';
import { NotificationBell } from './NotificationBell';
import { Chatbot } from './Chatbot';
import { Spinner } from './ui';
import type { Role } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV: Record<Role, NavItem[]> = {
  customer: [
    { href: '/customer', label: 'Home', icon: '🏠' },
    { href: '/customer/bookings', label: 'My Bookings', icon: '🔧' },
    { href: '/customer/store', label: 'Spare Parts', icon: '🛒' },
    { href: '/customer/orders', label: 'Orders', icon: '📦' },
    { href: '/customer/profile', label: 'Profile', icon: '👤' },
  ],
  mechanic: [
    { href: '/mechanic', label: 'Dashboard', icon: '📊' },
    { href: '/mechanic/jobs', label: 'Open Jobs', icon: '🔧' },
    { href: '/mechanic/earnings', label: 'Earnings', icon: '💰' },
    { href: '/mechanic/history', label: 'History', icon: '📜' },
    { href: '/mechanic/profile', label: 'Profile', icon: '👤' },
  ],
  vendor: [
    { href: '/vendor', label: 'Dashboard', icon: '📊' },
    { href: '/vendor/products', label: 'Products', icon: '🔩' },
    { href: '/vendor/inventory', label: 'Inventory', icon: '📋' },
    { href: '/vendor/orders', label: 'Orders', icon: '📦' },
  ],
  admin: [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/users', label: 'Users', icon: '👥' },
    { href: '/admin/bookings', label: 'Bookings', icon: '🔧' },
    { href: '/admin/reports', label: 'Reports', icon: '📈' },
    { href: '/admin/complaints', label: 'Complaints', icon: '⚠️' },
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
                {item.label}
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
              <button onClick={logout} className="btn-ghost px-2 py-1 text-xs" title="Log out">
                Log out
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
                {item.label}
              </Link>
            ))}
            <button onClick={logout} className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600">
              <span className="mr-2">🚪</span>Log out
            </button>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

      {role === 'customer' && <Chatbot />}
    </div>
  );
}
