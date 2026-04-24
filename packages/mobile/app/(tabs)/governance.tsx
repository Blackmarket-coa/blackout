import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getSession } from '../../components/session';
import { tokens } from '../../components/uiTokens';

const API_BASE_URL = 'http://localhost:8787/v1';
const COMMUNITY_ID = 'general';

type GovernanceView = 'list' | 'detail' | 'create';

interface GovernanceEvent {
  id: string;
  module: string;
  type: string;
  payload: Record<string, string>;
  createdAt: string;
}

interface ProposalOption {
  id: string;
  text: string;
}

interface Proposal {
  id: string;
  communityId: string;
  proposerId: string;
  title: string;
  description?: string;
  options: ProposalOption[];
  status: 'active' | 'passed' | 'failed' | 'cancelled' | string;
  createdAt?: string;
  results?: Record<string, number>;
}

function authHeaders(): Record<string, string> {
  const session = getSession();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-blackout-capabilities': 'governance.read,governance.write',
  };

  if (session.token) {
    headers.authorization = `Bearer ${session.token}`;
  }

  return headers;
}

function eventStatusColor(eventType: string): string {
  if (eventType.includes('created')) return '#61D095';
  if (eventType.includes('cast')) return '#7CB7FF';
  return tokens.colors.textMuted;
}

export default function GovernanceScreen() {
  const session = getSession();
  const [view, setView] = useState<GovernanceView>('list');
  const [events, setEvents] = useState<GovernanceEvent[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState('Yes,No');
  const [durationHours, setDurationHours] = useState('168');

  const selectedProposal = useMemo(
    () => proposals.find((proposal) => proposal.id === selectedProposalId) ?? null,
    [proposals, selectedProposalId]
  );

  const refreshGovernance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const eventResponse = await fetch(`${API_BASE_URL}/governance/events`, { headers: authHeaders() });
      if (!eventResponse.ok) {
        throw new Error(`Failed to fetch governance events (${eventResponse.status})`);
      }
      const eventBody = (await eventResponse.json()) as GovernanceEvent[];
      setEvents(eventBody);

      const proposalIds = Array.from(
        new Set(
          eventBody
            .filter((event) => event.type === 'governance.proposal.created')
            .map((event) => event.payload.proposalId)
            .filter(Boolean)
        )
      );

      if (proposalIds.length === 0) {
        setProposals([]);
        return;
      }

      const proposalsWithResults = await Promise.all(
        proposalIds.map(async (proposalId) => {
          const proposalResponse = await fetch(`${API_BASE_URL}/governance/proposals/${proposalId}`, {
            headers: authHeaders(),
          });

          if (!proposalResponse.ok) {
            throw new Error(`Failed to fetch proposal ${proposalId}`);
          }

          return (await proposalResponse.json()) as Proposal;
        })
      );

      setProposals(
        proposalsWithResults.sort(
          (a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '')
        )
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshGovernance();
  }, [refreshGovernance]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', (event) => {
      const url = event.url;
      if (!url.startsWith('blackout://governance')) return;

      if (url.includes('/create')) {
        setView('create');
        return;
      }

      const match = url.match(/proposals\/([^/?#]+)/);
      if (match?.[1]) {
        setSelectedProposalId(decodeURIComponent(match[1]));
        setView('detail');
      } else {
        setView('list');
      }
    });

    return () => sub.remove();
  }, []);

  const castVote = useCallback(
    async (choice: string) => {
      if (!selectedProposal || !session.userId) {
        setError('Sign in again to vote.');
        return;
      }

      setSubmitting(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/governance/votes`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ voteId: selectedProposal.id, userId: session.userId, choice }),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        await refreshGovernance();
      } catch (cause) {
        setError((cause as Error).message);
      } finally {
        setSubmitting(false);
      }
    },
    [refreshGovernance, selectedProposal, session.userId]
  );

  const createProposal = useCallback(async () => {
    if (!session.userId) {
      setError('Sign in again to create proposals.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const proposalOptions = options
        .split(',')
        .map((option) => option.trim())
        .filter(Boolean)
        .map((label, index) => ({ id: `opt-${index + 1}`, label }));

      const response = await fetch(`${API_BASE_URL}/governance/proposals`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          communityId: COMMUNITY_ID,
          proposerId: session.userId,
          title,
          description,
          options: proposalOptions.length > 0 ? proposalOptions : undefined,
          durationHours: Number.parseInt(durationHours, 10) || 168,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setTitle('');
      setDescription('');
      setOptions('Yes,No');
      setDurationHours('168');
      setView('list');
      await refreshGovernance();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [description, durationHours, options, refreshGovernance, session.userId, title]);

  return (
    <View style={styles.container}>
      <View style={styles.switchRow}>
        <TouchableOpacity
          style={[styles.chip, view === 'list' && styles.chipActive]}
          onPress={() => setView('list')}
        >
          <Text style={styles.chipText}>Proposals</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, view === 'create' && styles.chipActive]}
          onPress={() => setView('create')}
        >
          <Text style={styles.chipText}>Create</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chip} onPress={() => void refreshGovernance()}>
          <Text style={styles.chipText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={tokens.colors.textPrimary} style={styles.loader} />
      ) : null}

      {!loading && view === 'list' ? (
        <ScrollView contentContainerStyle={styles.content}>
          {proposals.length === 0 ? <Text style={styles.empty}>No proposals yet.</Text> : null}

          {proposals.map((proposal) => (
            <TouchableOpacity
              key={proposal.id}
              style={styles.card}
              onPress={() => {
                setSelectedProposalId(proposal.id);
                setView('detail');
              }}
            >
              <Text style={styles.title}>{proposal.title}</Text>
              <Text style={styles.description}>{proposal.description || 'No description provided.'}</Text>
              <Text style={styles.meta}>Status: {proposal.status}</Text>
              <Text style={styles.meta}>Proposal ID: {proposal.id}</Text>
              <TouchableOpacity
                onPress={() => void Linking.openURL(`blackout://governance/proposals/${proposal.id}`)}
              >
                <Text style={styles.deepLink}>Open deep link</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent governance events</Text>
            {events.length === 0 ? <Text style={styles.empty}>No governance events yet.</Text> : null}
            {events.slice(0, 10).map((event) => (
              <View key={event.id} style={styles.eventItem}>
                <View style={[styles.dot, { backgroundColor: eventStatusColor(event.type) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventType}>{event.type}</Text>
                  <Text style={styles.meta}>{new Date(event.createdAt).toLocaleString()}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}

      {!loading && view === 'detail' ? (
        <ScrollView contentContainerStyle={styles.content}>
          {!selectedProposal ? (
            <Text style={styles.empty}>Select a proposal from the list.</Text>
          ) : (
            <View style={styles.card}>
              <Text style={styles.title}>{selectedProposal.title}</Text>
              <Text style={styles.description}>{selectedProposal.description || 'No description provided.'}</Text>
              <Text style={styles.meta}>Status: {selectedProposal.status}</Text>
              <Text style={styles.sectionTitle}>Vote actions</Text>
              <View style={styles.voteRow}>
                {selectedProposal.options.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.button, submitting && styles.buttonDisabled]}
                    disabled={submitting}
                    onPress={() => void castVote(option.id)}
                  >
                    <Text style={styles.buttonText}>{submitting ? 'Submitting…' : option.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.sectionTitle}>Current tally</Text>
              {selectedProposal.results ? (
                Object.entries(selectedProposal.results).map(([choice, count]) => (
                  <Text key={choice} style={styles.meta}>
                    {choice}: {count}
                  </Text>
                ))
              ) : (
                <Text style={styles.meta}>No votes yet.</Text>
              )}
            </View>
          )}
        </ScrollView>
      ) : null}

      {!loading && view === 'create' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Create proposal</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Proposal title"
              placeholderTextColor={tokens.colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description"
              placeholderTextColor={tokens.colors.textMuted}
              multiline
              style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
            />
            <TextInput
              value={options}
              onChangeText={setOptions}
              placeholder="Comma-separated options (e.g., Yes,No,Abstain)"
              placeholderTextColor={tokens.colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={durationHours}
              onChangeText={setDurationHours}
              keyboardType="numeric"
              placeholder="Duration hours"
              placeholderTextColor={tokens.colors.textMuted}
              style={styles.input}
            />
            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled]}
              disabled={submitting}
              onPress={() => void createProposal()}
            >
              <Text style={styles.buttonText}>{submitting ? 'Creating…' : 'Submit proposal'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void Linking.openURL('blackout://governance/create')}>
              <Text style={styles.deepLink}>Notification deep link: blackout://governance/create</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.background, padding: tokens.spacing.md, gap: tokens.spacing.sm },
  content: { paddingBottom: tokens.spacing.xl, gap: tokens.spacing.sm },
  loader: { marginTop: tokens.spacing.lg },
  switchRow: { flexDirection: 'row', gap: tokens.spacing.xs },
  chip: {
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
  },
  chipActive: { backgroundColor: tokens.colors.primary, borderColor: tokens.colors.primary },
  chipText: { color: tokens.colors.textPrimary, fontSize: 12 },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  title: { color: tokens.colors.textPrimary, fontSize: 16, fontWeight: '600' },
  description: { color: tokens.colors.textSecondary, fontSize: 13 },
  meta: { color: tokens.colors.textMuted, fontSize: 12 },
  section: { marginTop: tokens.spacing.sm, gap: tokens.spacing.xs },
  sectionTitle: { color: tokens.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  voteRow: { flexDirection: 'row', gap: tokens.spacing.xs, flexWrap: 'wrap' },
  button: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: tokens.colors.disabled },
  buttonText: { color: tokens.colors.textPrimary, fontWeight: '600' },
  input: {
    backgroundColor: tokens.colors.surfaceElevated,
    borderColor: tokens.colors.border,
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    color: tokens.colors.textPrimary,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
  },
  error: {
    color: tokens.colors.errorText,
    backgroundColor: tokens.colors.errorSurface,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
    fontSize: 12,
  },
  empty: { color: tokens.colors.textMuted, textAlign: 'center', marginTop: tokens.spacing.lg },
  deepLink: { color: tokens.colors.link, fontSize: 12, marginTop: tokens.spacing.xs },
  eventItem: { flexDirection: 'row', gap: tokens.spacing.xs, alignItems: 'center', paddingVertical: 4 },
  eventType: { color: tokens.colors.textSecondary, fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 999 },
});
