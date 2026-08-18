import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, formatDateTime, rupees } from '../../lib/api';
import { Card, Empty, Loading, StatusBadge, Stars } from '../../components/ui';
import { colors } from '../../lib/theme';

interface HistoryJob {
  _id: string;
  reference: string;
  status: string;
  updatedAt: string;
  charges?: { total: number };
  customer?: { name: string };
  serviceType?: { name: string; icon?: string };
  vehicle?: { make: string; model: string; registrationNumber: string };
  review?: { rating: number; comment?: string } | null;
}

/** Completed and cancelled jobs, each with the rating the customer left. */
export default function MechanicHistoryScreen() {
  const [jobs, setJobs] = useState<HistoryJob[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ jobs: HistoryJob[] }>('/mechanic/history');
      setJobs(res.jobs || []);
    } catch {
      setJobs([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!jobs) return <Loading />;

  const completed = jobs.filter((j) => j.status === 'completed');
  const earned = completed.reduce((n, j) => n + (j.charges?.total || 0), 0);

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
    >
      {jobs.length === 0 ? (
        <Card>
          <Empty icon="📜" title="No past jobs" hint="Completed and cancelled jobs will be listed here." />
        </Card>
      ) : (
        <>
          <Card>
            <View style={styles.summary}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryValue}>{completed.length}</Text>
                <Text style={styles.summaryLabel}>Completed</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryCell}>
                <Text style={styles.summaryValue}>{rupees(earned)}</Text>
                <Text style={styles.summaryLabel}>Billed</Text>
              </View>
            </View>
          </Card>

          {jobs.map((j) => (
            <Card key={j._id} style={{ marginTop: 12 }}>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.service}>
                    {j.serviceType?.icon ? `${j.serviceType.icon} ` : ''}
                    {j.serviceType?.name || 'Service'}
                  </Text>
                  <Text style={styles.ref}>
                    {j.reference} · {formatDateTime(j.updatedAt)}
                  </Text>
                </View>
                <StatusBadge status={j.status} />
              </View>

              <View style={styles.divider} />

              <Text style={styles.meta}>Customer: {j.customer?.name || '—'}</Text>
              {j.vehicle ? (
                <Text style={styles.meta}>
                  Bike: {j.vehicle.make} {j.vehicle.model} · {j.vehicle.registrationNumber}
                </Text>
              ) : null}
              {j.charges?.total ? <Text style={styles.meta}>Billed: {rupees(j.charges.total)}</Text> : null}

              {j.review ? (
                <View style={styles.review}>
                  <View style={styles.reviewHead}>
                    <Stars value={j.review.rating} />
                    <Text style={styles.reviewScore}>{j.review.rating}/5</Text>
                  </View>
                  {j.review.comment ? <Text style={styles.reviewComment}>“{j.review.comment}”</Text> : null}
                </View>
              ) : j.status === 'completed' ? (
                <Text style={styles.noReview}>Not rated by the customer</Text>
              ) : null}
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  summary: { flexDirection: 'row', alignItems: 'center' },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 34, backgroundColor: colors.border },
  summaryValue: { fontSize: 20, fontWeight: '900', color: colors.text },
  summaryLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  service: { fontSize: 15, fontWeight: '800', color: colors.text },
  ref: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 3 },

  review: { marginTop: 12, backgroundColor: colors.successLight, borderRadius: 10, padding: 10 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewScore: { fontSize: 13, fontWeight: '800', color: '#065f46' },
  reviewComment: { fontSize: 13, color: '#065f46', marginTop: 6, fontStyle: 'italic' },
  noReview: { fontSize: 12.5, color: colors.textMuted, marginTop: 12 },
});
