import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { Loading } from '../components/ui';

/** Sends each signed-in role to its own home screen, everyone else to login. */
export default function Index() {
  const { user, loading } = useAuth();

  if (loading) return <Loading label="Checking your session…" />;
  if (!user) return <Redirect href="/login" />;

  if (user.role === 'mechanic') return <Redirect href="/mechanic" />;
  if (user.role === 'customer') return <Redirect href="/customer" />;

  // Vendors and admins work from the web dashboard.
  return <Redirect href="/login" />;
}
