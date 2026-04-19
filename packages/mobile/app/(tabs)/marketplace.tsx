import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  fetchEntitlements,
  fetchListings,
  fetchProviders,
  startCheckout,
  type MarketplaceProviderId,
  type NormalizedEntitlement,
  type NormalizedListing,
  type ProviderSummary,
} from '../../components/marketplaceClient';

type View = 'catalog' | 'library';

const categoryChoices: Array<{ id: string | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'emoji-sticker', label: 'Emoji & Stickers' },
  { id: 'meme-asset', label: 'Memes & Assets' },
  { id: 'stego-software', label: 'Stego & Software' },
  { id: 'plugin-curated', label: 'Plugins' },
  { id: 'subscription', label: 'Subscriptions' },
];

function ownedKey(entitlement: NormalizedEntitlement): string {
  return `${entitlement.providerId}:${entitlement.providerListingId}`;
}

export default function MarketplaceScreen() {
  const [view, setView] = useState<View>('catalog');
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [providerFilter, setProviderFilter] = useState<MarketplaceProviderId | 'all'>('all');
  const [category, setCategory] = useState<string | 'all'>('all');
  const [search, setSearch] = useState('');
  const [listings, setListings] = useState<NormalizedListing[]>([]);
  const [entitlements, setEntitlements] = useState<NormalizedEntitlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshEntitlements = useCallback(async () => {
    try {
      setEntitlements(await fetchEntitlements());
    } catch (err) {
      console.warn('[marketplace] entitlements', err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [providerList] = await Promise.all([fetchProviders(), refreshEntitlements()]);
        setProviders(providerList);
      } catch (err) {
        setError('Unable to load marketplace providers.');
        console.warn('[marketplace] providers', err);
      }
    })();
  }, [refreshEntitlements]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list = await fetchListings({
          providerId: providerFilter === 'all' ? undefined : providerFilter,
          category: category === 'all' ? undefined : category,
          q: search.trim() || undefined,
        });
        if (!cancelled) setListings(list);
      } catch (err) {
        if (!cancelled) setError('Unable to load listings.');
        console.warn('[marketplace] listings', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providerFilter, category, search]);

  const ownedSet = useMemo(
    () =>
      new Set(
        entitlements
          .filter((entitlement) => entitlement.status === 'granted')
          .map(ownedKey)
      ),
    [entitlements]
  );

  const handlePurchase = useCallback(
    async (listing: NormalizedListing) => {
      const key = `${listing.providerId}:${listing.providerListingId}`;
      setPurchasingId(key);
      setError(null);
      try {
        const { redirectUrl } = await startCheckout(listing.providerId, listing.providerListingId);
        await Linking.openURL(redirectUrl);
        setTimeout(() => {
          void refreshEntitlements();
        }, 3_000);
      } catch (err) {
        setError('Checkout failed to start.');
        console.warn('[marketplace] checkout', err);
      } finally {
        setPurchasingId(null);
      }
    },
    [refreshEntitlements]
  );

  return (
    <View style={styles.container}>
      <View style={styles.switchRow}>
        <TouchableOpacity
          style={[styles.chip, view === 'catalog' && styles.chipActive]}
          onPress={() => setView('catalog')}
        >
          <Text style={styles.chipText}>Catalog</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, view === 'library' && styles.chipActive]}
          onPress={() => {
            setView('library');
            void refreshEntitlements();
          }}
        >
          <Text style={styles.chipText}>Library ({entitlements.length})</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {view === 'catalog' ? (
        <View style={{ flex: 1 }}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search listings"
            placeholderTextColor="#666"
            style={styles.input}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.chip, providerFilter === 'all' && styles.chipActive]}
              onPress={() => setProviderFilter('all')}
            >
              <Text style={styles.chipText}>All providers</Text>
            </TouchableOpacity>
            {providers
              .filter((provider) => provider.enabled)
              .map((provider) => (
                <TouchableOpacity
                  key={provider.id}
                  style={[styles.chip, providerFilter === provider.id && styles.chipActive]}
                  onPress={() => setProviderFilter(provider.id)}
                >
                  <Text style={styles.chipText}>{provider.displayName}</Text>
                </TouchableOpacity>
              ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            {categoryChoices.map((choice) => (
              <TouchableOpacity
                key={choice.id}
                style={[styles.chip, category === choice.id && styles.chipActive]}
                onPress={() => setCategory(choice.id)}
              >
                <Text style={styles.chipText}>{choice.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 20 }} color="#e0e0e0" />
          ) : (
            <FlatList
              data={listings}
              keyExtractor={(item) => `${item.providerId}:${item.providerListingId}`}
              renderItem={({ item }) => {
                const key = `${item.providerId}:${item.providerListingId}`;
                const owned = ownedSet.has(key);
                const providerName =
                  providers.find((provider) => provider.id === item.providerId)?.displayName ??
                  item.providerId;
                return (
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.providerBadge}>{providerName}</Text>
                      <Text style={styles.categoryText}>{item.category}</Text>
                    </View>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.description}>{item.description}</Text>
                    <Text style={styles.price}>
                      {(item.priceCents / 100).toFixed(2)} {item.currency.toUpperCase()}
                    </Text>
                    <TouchableOpacity
                      style={[styles.button, (owned || purchasingId === key) && styles.buttonDisabled]}
                      disabled={owned || purchasingId === key}
                      onPress={() => handlePurchase(item)}
                    >
                      <Text style={styles.buttonText}>
                        {owned ? 'Owned' : purchasingId === key ? 'Opening checkout…' : 'Purchase'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>No listings match these filters.</Text>
              }
            />
          )}
        </View>
      ) : (
        <FlatList
          data={entitlements}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.providerBadge}>{item.providerId}</Text>
              <Text style={styles.title}>
                {item.kind} · {item.providerListingId}
              </Text>
              <Text style={styles.description}>Status: {item.status}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No purchases yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a', padding: 12, gap: 8 },
  switchRow: { flexDirection: 'row', gap: 6 },
  filterRow: { flexGrow: 0, marginTop: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#222',
    marginRight: 6,
  },
  chipActive: { backgroundColor: '#3b5b92', borderColor: '#3b5b92' },
  chipText: { color: '#e0e0e0', fontSize: 12 },
  input: {
    backgroundColor: '#222',
    color: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#222',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  providerBadge: {
    color: '#bbb',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryText: { color: '#888', fontSize: 11 },
  title: { color: '#f0f0f0', fontSize: 15, fontWeight: '600' },
  description: { color: '#bbb', fontSize: 13 },
  price: { color: '#fff', fontSize: 16, fontWeight: '600' },
  button: {
    backgroundColor: '#3b5b92',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#333' },
  buttonText: { color: '#e0e0e0', fontWeight: '500' },
  error: {
    color: '#f99',
    backgroundColor: '#4a1f1f',
    padding: 8,
    borderRadius: 8,
    fontSize: 13,
  },
  empty: { color: '#888', textAlign: 'center', marginTop: 20 },
});
