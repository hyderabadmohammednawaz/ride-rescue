import { AppShell } from '@/components/AppShell';

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="vendor">{children}</AppShell>;
}
