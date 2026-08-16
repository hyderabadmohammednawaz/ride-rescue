import { AppShell } from '@/components/AppShell';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="customer">{children}</AppShell>;
}
