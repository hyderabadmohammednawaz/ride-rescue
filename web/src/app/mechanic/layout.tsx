import { AppShell } from '@/components/AppShell';

export default function MechanicLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="mechanic">{children}</AppShell>;
}
