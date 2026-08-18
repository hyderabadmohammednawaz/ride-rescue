import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../lib/theme';

/**
 * Bottom tabs for the mechanic, matching the five-item nav the web app shows.
 *
 * Until now these screens were only reachable from buttons stacked at the bottom
 * of the dashboard, so getting to earnings meant scrolling home first. A mechanic
 * uses this between jobs, one-handed — the destinations need to be permanently
 * on screen.
 *
 * The job detail screen is deliberately not a tab. It belongs to one job rather
 * than being a place you navigate to, so it is pushed over the tabs and keeps a
 * back button.
 */

const icon = (glyph: string) => {
  const TabIcon = ({ color }: { color: string }) => (
    <Text style={{ fontSize: 19, color, opacity: 0.95 }}>{glyph}</Text>
  );
  TabIcon.displayName = `TabIcon(${glyph})`;
  return TabIcon;
};

export default function MechanicTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontWeight: '800', color: colors.text },
        headerTintColor: colors.brand,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarLabel: 'Jobs', tabBarIcon: icon('📊') }}
      />
      <Tabs.Screen
        name="earnings"
        options={{ title: 'Earnings', tabBarLabel: 'Earnings', tabBarIcon: icon('💰') }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'Job history', tabBarLabel: 'History', tabBarIcon: icon('📜') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'My profile', tabBarLabel: 'Profile', tabBarIcon: icon('👤') }}
      />

      {/* Reached from a job card, not from the tab bar. */}
      <Tabs.Screen name="job/[id]" options={{ href: null, title: 'Job details' }} />
    </Tabs>
  );
}
