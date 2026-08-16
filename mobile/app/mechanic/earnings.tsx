import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, formatDateTime, rupees } from '../../lib/api';
import { Card, Loading, StatTile, StatusBadge } from '../../components/ui';
import { colors } from '../../lib/theme';

interface Earnings {
  today: number;
  week: number;
  month: number;
  lifetime: number;
  unpaidAmount: number;
  jobCount: number;
  byDay: { date: string; amount: number }[];
  recent: { reference: string; amount: number; completedAt: string; paymentStatus: string }[];
}

export default function EarningsScreen() {
  const [data, setData] = useState<Earnings | null>(null);

  useEffect(() => {
    api<Earnings>('/mechanic/earnings').then(setData).catch(() => {});
  }, []);

  if (!data) return <Loading />;

  const max = Math.max(1, ...data.byDay.map((d) => d.amount));

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.tiles}>
        <StatTile label="Today" value={rupees(data.today)} tone="success" />
        <StatTile label="This week" value={rupees(data.week)} />
      </View>
      <View style={[styles.tiles, { marginTop: 10 }]}>
        <StatTile label="This month" value={rupees(data.month)} />
        <StatTile label="Lifetime" value={rupees(data.lifetime)} hint={`${data.jobCount} jobs`} />
      </View>

      {data.unpaidAmount > 0 ? (
        <Card style={{ marginTop: 14, backgroundColor: colors.warnLight, borderColor: '#fcd34d' }}>
          <Text style={styles.warnTitle}>{rupees(data.unpaidAmount)} awaiting customer payment</Text>
          <Text style={styles.warnBody}>This settles automatically once the customer pays in their app.</Text>
        </Card>
      ) : null}

      <Card style={{ marginTop: 14 }}>
        <Text style={styles.cardTitle}>Last 14 days</Text>
        {data.byDay.length === 0 ? (
          <Text style={styles.muted}>No earnings recorded yet.</Text>
        ) : (
          <View style={styles.chart}>
            {data.byDay.map((d) => (
              <View key={d.date} style={styles.barColumn}>
                <View style={[styles.bar, { height: Math.max(3, (d.amount / max) * 110) }]} />
                <Text style={styles.barLabel}>{d.date.slice(5)}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Text style={styles.cardTitle}>Recent jobs</Text>
        {data.recent.length === 0 ? (
          <Text style={styles.muted}>No completed jobs yet.</Text>
        ) : (
          data.recent.map((r) => (
            <View key={r.reference} style={styles.recentRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.recentRef}>{r.reference}</Text>
                <Text style={styles.muted}>{formatDateTime(r.completedAt)}</Text>
              </View>
              <StatusBadge status={r.paymentStatus} />
              <Text style={styles.recentAmount}>{rupees(r.amount)}</Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  tiles: { flexDirection: 'row', gap: 10 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 12 },
  muted: { fontSize: 12, color: colors.textMuted },
  warnTitle: { fontSize: 14, fontWeight: '800', color: '#92400e' },
  warnBody: { fontSize: 12, color: '#92400e', marginTop: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 140 },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '100%', backgroundColor: colors.brand, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barLabel: { fontSize: 8, color: colors.textMuted },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recentRef: { fontSize: 13, fontWeight: '700', color: colors.text },
  recentAmount: { fontSize: 14, fontWeight: '800', color: colors.text, width: 74, textAlign: 'right' },
});
