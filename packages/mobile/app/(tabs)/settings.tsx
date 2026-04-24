import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { clearSession, getSession } from '../../components/session';
import { tokens } from '../../components/uiTokens';

const API_BASE_URL = 'http://localhost:8787/v1';

type SettingsView = 'overview' | 'notifications' | 'privacy' | 'subscription';

interface SubscriptionProduct {
  code: string;
  name?: string;
  priceCents?: number;
  interval?: string;
}

interface SubscriptionSummary {
  status?: string;
  planCode?: string;
  renewsAt?: string;
  entitlement?: string;
}

function authHeaders(): Record<string, string> {
  const session = getSession();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (session.token) headers.authorization = `Bearer ${session.token}`;
  return headers;
}

export default function SettingsScreen() {
  const session = getSession();
  const [view, setView] = useState<SettingsView>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [governanceAlerts, setGovernanceAlerts] = useState(true);
  const [marketingUpdates, setMarketingUpdates] = useState(false);

  const mockNotificationFeed = useMemo(
    () => [
      { id: '1', label: 'New governance vote opened', deepLink: 'blackout://governance/proposals/demo-proposal' },
      { id: '2', label: 'Your subscription renewal is due', deepLink: 'blackout://settings/subscription' },
      { id: '3', label: 'Session security alert', deepLink: 'blackout://settings/privacy' },
    ],
    []
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansResponse, meResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/subscriptions/plans`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/subscriptions/me`, { headers: authHeaders() }),
      ]);

      if (!plansResponse.ok) {
        throw new Error(`Failed to load plans (${plansResponse.status})`);
      }

      const plansBody = (await plansResponse.json()) as { products?: SubscriptionProduct[] };
      setProducts(plansBody.products ?? []);

      if (meResponse.ok) {
        const meBody = (await meResponse.json()) as { subscription?: SubscriptionSummary };
        setSubscription(meBody.subscription ?? null);
      } else {
        setSubscription(null);
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (!url.startsWith('blackout://settings')) return;
      if (url.includes('/notifications')) {
        setView('notifications');
        return;
      }
      if (url.includes('/privacy')) {
        setView('privacy');
        return;
      }
      if (url.includes('/subscription')) {
        setView('subscription');
        return;
      }
      setView('overview');
    });

    return () => sub.remove();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.switchRow}>
        {(
          [
            ['overview', 'Profile'],
            ['notifications', 'Notifications'],
            ['privacy', 'Privacy'],
            ['subscription', 'Subscription'],
          ] as const
        ).map(([id, label]) => (
          <TouchableOpacity
            key={id}
            style={[styles.chip, view === id && styles.chipActive]}
            onPress={() => setView(id)}
          >
            <Text style={styles.chipText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={tokens.colors.textPrimary} style={styles.loader} /> : null}

      {!loading ? (
        <ScrollView contentContainerStyle={styles.content}>
          {view === 'overview' ? (
            <>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Account & profile</Text>
                <Text style={styles.value}>User ID: {session.userId ?? 'Unknown user'}</Text>
                <Text style={styles.value}>Plan: {subscription?.planCode ?? 'Free'}</Text>
                <Text style={styles.value}>Status: {subscription?.status ?? 'inactive'}</Text>
                <TouchableOpacity onPress={() => void Linking.openURL('blackout://settings/subscription')}>
                  <Text style={styles.deepLink}>Open subscription deep link</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>In-app notification actions</Text>
                {mockNotificationFeed.map((item) => (
                  <TouchableOpacity key={item.id} style={styles.listRow} onPress={() => void Linking.openURL(item.deepLink)}>
                    <Text style={styles.value}>{item.label}</Text>
                    <Text style={styles.deepLink}>{item.deepLink}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}

          {view === 'notifications' ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Notification controls</Text>
              <View style={styles.switchRowItem}>
                <Text style={styles.value}>Push notifications</Text>
                <Switch value={pushEnabled} onValueChange={setPushEnabled} />
              </View>
              <View style={styles.switchRowItem}>
                <Text style={styles.value}>Email notifications</Text>
                <Switch value={emailEnabled} onValueChange={setEmailEnabled} />
              </View>
              <View style={styles.switchRowItem}>
                <Text style={styles.value}>Governance alerts</Text>
                <Switch value={governanceAlerts} onValueChange={setGovernanceAlerts} />
              </View>
              <View style={styles.switchRowItem}>
                <Text style={styles.value}>Marketing updates</Text>
                <Switch value={marketingUpdates} onValueChange={setMarketingUpdates} />
              </View>
              <Text style={styles.meta}>Changes save instantly for this device session.</Text>
            </View>
          ) : null}

          {view === 'privacy' ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Privacy & session management</Text>
              <Text style={styles.value}>Session token active: {session.token ? 'Yes' : 'No'}</Text>
              <Text style={styles.meta}>Last active session: current device (mocked)</Text>
              <TouchableOpacity style={styles.button} onPress={() => clearSession()}>
                <Text style={styles.buttonText}>Sign out of this session</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={() => void Linking.openURL('blackout://settings/privacy')}
              >
                <Text style={styles.buttonText}>Simulate security notification deep link</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {view === 'subscription' ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Subscription & entitlements</Text>
              <Text style={styles.value}>Current plan: {subscription?.planCode ?? 'none'}</Text>
              <Text style={styles.value}>Status: {subscription?.status ?? 'inactive'}</Text>
              <Text style={styles.value}>
                Renewal: {subscription?.renewsAt ? new Date(subscription.renewsAt).toLocaleString() : 'not scheduled'}
              </Text>
              <Text style={[styles.sectionTitle, { marginTop: tokens.spacing.sm }]}>Available plans</Text>
              {products.length === 0 ? <Text style={styles.empty}>No plans available.</Text> : null}
              {products.map((product) => (
                <View key={product.code} style={styles.listRow}>
                  <Text style={styles.value}>{product.name ?? product.code}</Text>
                  <Text style={styles.meta}>
                    {typeof product.priceCents === 'number' ? `$${(product.priceCents / 100).toFixed(2)}` : 'Contact sales'}
                    {product.interval ? ` / ${product.interval}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.background, padding: tokens.spacing.md, gap: tokens.spacing.sm },
  loader: { marginTop: tokens.spacing.md },
  content: { paddingBottom: tokens.spacing.xl, gap: tokens.spacing.sm },
  switchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.xs },
  chip: {
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  chipActive: { backgroundColor: tokens.colors.primary, borderColor: tokens.colors.primary },
  chipText: { color: tokens.colors.textPrimary, fontSize: 12 },
  card: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, padding: tokens.spacing.md, gap: tokens.spacing.sm },
  sectionTitle: { color: tokens.colors.textPrimary, fontSize: 15, fontWeight: '700' },
  value: { color: tokens.colors.textSecondary, fontSize: 13 },
  meta: { color: tokens.colors.textMuted, fontSize: 12 },
  listRow: {
    borderTopColor: tokens.colors.border,
    borderTopWidth: 1,
    paddingTop: tokens.spacing.sm,
    gap: 2,
  },
  switchRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopColor: tokens.colors.border,
    borderTopWidth: 1,
    paddingTop: tokens.spacing.sm,
  },
  button: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.spacing.sm,
    alignItems: 'center',
  },
  secondaryButton: { backgroundColor: tokens.colors.surfaceElevated },
  buttonText: { color: tokens.colors.textPrimary, fontWeight: '600', fontSize: 12 },
  error: {
    color: tokens.colors.errorText,
    backgroundColor: tokens.colors.errorSurface,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
    fontSize: 12,
  },
  deepLink: { color: tokens.colors.link, fontSize: 12 },
  empty: { color: tokens.colors.textMuted, textAlign: 'center' },
});
