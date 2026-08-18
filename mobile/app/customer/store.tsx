import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api, rupees } from '../../lib/api';
import { useCart } from '../../lib/cart';
import { Button, Card, Empty } from '../../components/ui';
import { colors } from '../../lib/theme';

/**
 * Spare parts catalogue.
 *
 * Recommendations come first: the AI filters to the customer's own bike, which
 * is far more useful on a small screen than a generic grid they have to search
 * through. The full catalogue sits underneath for everything else.
 */

/**
 * Shape verified against the live API. Two things are not what they look like:
 * `image` is an emoji, not a URL — the catalogue is illustrated with glyphs
 * rather than photographs — and the recommender returns `reasons` as an array
 * under a `recommendations` key, not `parts`.
 */
interface Part {
  _id: string;
  name: string;
  brand?: string;
  price: number;
  mrp?: number;
  stock: number;
  image?: string;
  category?: string;
  matchScore?: number;
  reasons?: string[];
}

export default function StoreScreen() {
  const router = useRouter();
  const { add, count } = useCart();

  const [parts, setParts] = useState<Part[]>([]);
  const [recommended, setRecommended] = useState<Part[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (search = '') => {
    try {
      const qs = search.trim() ? `?q=${encodeURIComponent(search.trim())}&limit=60` : '?limit=60';
      const [all, rec] = await Promise.all([
        api<{ parts: Part[] }>(`/parts${qs}`),
        // Recommendations need a vehicle on the account; an empty list is normal.
        api<{ recommendations: Part[] }>('/parts/recommended?limit=6').catch(() => ({
          recommendations: [],
        })),
      ]);
      setParts(all.parts || []);
      setRecommended(rec.recommendations || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce so a search does not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setLoading(true);
      load(query);
    }, 350);
    return () => clearTimeout(id);
  }, [query, load]);

  const tile = (p: Part, showReason = false) => (
    <Card key={p._id} style={styles.tile}>
      <View style={styles.tileTop}>
        {/* The catalogue illustrates parts with an emoji, not a photo URL. */}
        <View style={styles.image}>
          <Text style={styles.imageGlyph}>{p.image || '🔩'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.partName} numberOfLines={2}>
            {p.name}
          </Text>
          {p.brand ? <Text style={styles.brand}>{p.brand}</Text> : null}
          <View style={styles.priceRow}>
            <Text style={styles.price}>{rupees(p.price)}</Text>
            {p.mrp && p.mrp > p.price ? <Text style={styles.mrp}>{rupees(p.mrp)}</Text> : null}
          </View>
          {p.stock > 0 ? (
            <Text style={p.stock <= 5 ? styles.lowStock : styles.inStock}>
              {p.stock <= 5 ? `Only ${p.stock} left` : 'In stock'}
            </Text>
          ) : (
            <Text style={styles.outOfStock}>Out of stock</Text>
          )}
        </View>
      </View>

      {showReason && p.reasons?.length ? (
        <Text style={styles.reason}>💡 {p.reasons[0]}</Text>
      ) : null}

      <Button
        label={p.stock > 0 ? 'Add to cart' : 'Unavailable'}
        variant={p.stock > 0 ? 'primary' : 'secondary'}
        disabled={p.stock <= 0}
        onPress={() => add(p)}
        style={{ marginTop: 10 }}
      />
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(query);
            }}
          />
        }
      >
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search parts, brands or your bike model"
          placeholderTextColor="#94a3b8"
          style={styles.search}
          returnKeyType="search"
        />

        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={colors.brand} />
        ) : (
          <>
            {!query && recommended.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Recommended for your bike</Text>
                <Text style={styles.sectionHint}>
                  Matched to your make and model, and to what similar bikes have needed.
                </Text>
                {recommended.map((p) => tile(p, true))}
              </>
            ) : null}

            <Text style={styles.sectionTitle}>
              {query ? `Results for “${query}”` : 'All spare parts'}
            </Text>

            {parts.length === 0 ? (
              <Card>
                <Empty
                  icon="🔍"
                  title="Nothing matched"
                  hint={query ? 'Try a different part name or brand.' : 'The catalogue is empty.'}
                />
              </Card>
            ) : (
              parts.map((p) => tile(p))
            )}
          </>
        )}
      </ScrollView>

      {count > 0 ? (
        <Pressable style={styles.cartBar} onPress={() => router.push('/customer/cart')}>
          <Text style={styles.cartBarText}>
            {count} item{count === 1 ? '' : 's'} in cart
          </Text>
          <Text style={styles.cartBarGo}>View cart →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 96 },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 22, marginBottom: 2 },
  sectionHint: { fontSize: 12.5, color: colors.textMuted, marginBottom: 10 },

  tile: { marginBottom: 12 },
  tileTop: { flexDirection: 'row', gap: 12 },
  image: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageGlyph: { fontSize: 32 },
  partName: { fontSize: 15, fontWeight: '700', color: colors.text },
  brand: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  price: { fontSize: 16, fontWeight: '900', color: colors.text },
  mrp: { fontSize: 12.5, color: colors.textMuted, textDecorationLine: 'line-through' },
  inStock: { fontSize: 12, color: colors.success, marginTop: 3, fontWeight: '600' },
  lowStock: { fontSize: 12, color: colors.warn, marginTop: 3, fontWeight: '700' },
  outOfStock: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  reason: {
    fontSize: 12.5,
    color: colors.brandDark,
    backgroundColor: colors.brandLight,
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },

  cartBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: colors.text,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cartBarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cartBarGo: { color: '#93c5fd', fontWeight: '800', fontSize: 14 },
});
