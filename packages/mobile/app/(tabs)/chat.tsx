import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { buildApiUrl, getApiConfigValidationError } from '../../components/apiConfig';
import { getSession } from '../../components/session';

const CHANNEL_ID = 'general';
const PAGE_SIZE = 30;
const POLL_BASE_INTERVAL_MS = 3000;
const POLL_MAX_INTERVAL_MS = 30000;
const PRESENCE_POLL_MS = 10000;
const TYPING_POLL_MS = 3000;

type DeliveryStatus = 'sent' | 'sending' | 'failed';

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  userId?: string;
}

interface ChatMessageUI extends ChatMessage {
  status: DeliveryStatus;
  clientId?: string;
  error?: string;
}

interface PresenceEntry {
  userId: string;
  status: 'online' | 'offline' | 'away';
}

interface TypingEntry {
  userId: string;
  typing: boolean;
}

const toKey = (message: Pick<ChatMessage, 'id' | 'content' | 'createdAt'>): string =>
  message.id || `${message.content}::${message.createdAt}`;

const mergeMessages = (existing: ChatMessageUI[], incoming: ChatMessageUI[]): ChatMessageUI[] => {
  const merged = new Map<string, ChatMessageUI>();

  [...existing, ...incoming].forEach((message) => {
    const key = toKey(message);
    const prev = merged.get(key);

    if (!prev) {
      merged.set(key, message);
      return;
    }

    const resolvedStatus: DeliveryStatus = prev.status === 'failed' || message.status === 'failed'
      ? 'failed'
      : prev.status === 'sending' && message.status === 'sent'
      ? 'sent'
      : message.status;

    merged.set(key, {
      ...prev,
      ...message,
      status: resolvedStatus,
      error: resolvedStatus === 'failed' ? (message.error ?? prev.error) : undefined,
    });
  });

  return Array.from(merged.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
};

const createLocalMessage = (content: string, userId: string): ChatMessageUI => ({
  id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  content,
  createdAt: new Date().toISOString(),
  userId,
  status: 'sending',
});

export default function ChatScreen() {
  const configError = useMemo(() => getApiConfigValidationError(), []);
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(configError);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [presence, setPresence] = useState<Record<string, PresenceEntry['status']>>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [unreadDividerTimestamp, setUnreadDividerTimestamp] = useState<string | null>(null);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failuresRef = useRef(0);
  const mountedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    if (presenceTimeoutRef.current) clearTimeout(presenceTimeoutRef.current);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  }, []);

  const fetchPage = useCallback(
    async (opts?: { before?: string; since?: string }) => {
      const url = new URL(buildApiUrl(`/messages/${CHANNEL_ID}`));
      url.searchParams.set('limit', String(PAGE_SIZE));
      if (opts?.before) url.searchParams.set('before', opts.before);
      if (opts?.since) url.searchParams.set('since', opts.since);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as ChatMessage[];
    },
    [],
  );

  const loadInitial = useCallback(async () => {
    try {
      const data = await fetchPage();
      setMessages(data.map((message) => ({ ...message, status: 'sent' as const })));
      setHasMoreHistory(data.length >= PAGE_SIZE);
      setUnreadDividerTimestamp(data.at(-1)?.createdAt ?? null);
      setError(null);
    } catch {
      setMessages([]);
      setError('Unable to load chat messages. Retrying in background.');
    }
  }, [fetchPage]);

  const schedulePoll = useCallback(() => {
    if (configError) return;

    const delay = Math.min(POLL_BASE_INTERVAL_MS * 2 ** failuresRef.current, POLL_MAX_INTERVAL_MS);

    pollTimeoutRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;

      const since = messages.at(-1)?.createdAt;
      try {
        const updates = await fetchPage(since ? { since } : undefined);
        if (updates.length > 0 && unreadDividerTimestamp) {
          const hasNewUnread = updates.some(
            (msg) => new Date(msg.createdAt).getTime() > new Date(unreadDividerTimestamp).getTime(),
          );
          if (hasNewUnread && !isReconnecting) {
            setUnreadDividerTimestamp(messages.at(-1)?.createdAt ?? unreadDividerTimestamp);
          }
        }

        setMessages((prev) =>
          mergeMessages(
            prev,
            updates.map((message) => ({ ...message, status: 'sent' as const })),
          ),
        );

        failuresRef.current = 0;
        setIsReconnecting(false);
        setError((prev) => (prev?.startsWith('Connection unstable') ? null : prev));
      } catch {
        failuresRef.current += 1;
        setIsReconnecting(true);
        setError('Connection unstable. Reconnecting…');
      } finally {
        schedulePoll();
      }
    }, delay);
  }, [configError, fetchPage, isReconnecting, messages, unreadDividerTimestamp]);

  const schedulePresence = useCallback(() => {
    if (configError) return;

    presenceTimeoutRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      try {
        const response = await fetch(buildApiUrl(`/messages/${CHANNEL_ID}/presence`));
        if (response.ok) {
          const entries = (await response.json()) as PresenceEntry[];
          const next: Record<string, PresenceEntry['status']> = {};
          entries.forEach((entry) => {
            next[entry.userId] = entry.status;
          });
          setPresence(next);
        }
      } catch {
        // Presence endpoint is optional; ignore failures.
      } finally {
        schedulePresence();
      }
    }, PRESENCE_POLL_MS);
  }, [configError]);

  const scheduleTyping = useCallback(() => {
    if (configError) return;

    typingTimeoutRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      try {
        const response = await fetch(buildApiUrl(`/messages/${CHANNEL_ID}/typing`));
        if (response.ok) {
          const entries = (await response.json()) as TypingEntry[];
          setTypingUsers(entries.filter((entry) => entry.typing).map((entry) => entry.userId));
        }
      } catch {
        // Typing endpoint is optional; ignore failures.
      } finally {
        scheduleTyping();
      }
    }, TYPING_POLL_MS);
  }, [configError]);

  useEffect(() => {
    mountedRef.current = true;

    if (configError) {
      setMessages([]);
      return () => {
        mountedRef.current = false;
      };
    }

    loadInitial().finally(() => {
      schedulePoll();
      schedulePresence();
      scheduleTyping();
    });

    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers, configError, loadInitial, schedulePoll, schedulePresence, scheduleTyping]);

  const loadOlder = useCallback(async () => {
    if (isLoadingHistory || !hasMoreHistory) return;

    setIsLoadingHistory(true);
    try {
      const oldestId = messages[0]?.id;
      const older = await fetchPage(oldestId ? { before: oldestId } : undefined);

      if (older.length < PAGE_SIZE) {
        setHasMoreHistory(false);
      }

      setMessages((prev) =>
        mergeMessages(
          older.map((message) => ({ ...message, status: 'sent' as const })),
          prev,
        ),
      );
    } catch {
      setError('Unable to load older messages. Check your connection and retry.');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [fetchPage, hasMoreHistory, isLoadingHistory, messages]);

  const sendMessage = useCallback(
    async (content: string, localDraft?: ChatMessageUI) => {
      if (configError) {
        setError(configError);
        return;
      }

      const trimmed = content.trim();
      const session = getSession();
      if (!session.userId || !trimmed) return;

      const draft = localDraft ?? createLocalMessage(trimmed, session.userId);

      if (!localDraft) {
        setMessages((prev) => mergeMessages(prev, [draft]));
        setText('');
      }

      try {
        const response = await fetch(buildApiUrl(`/messages/${CHANNEL_ID}`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
          },
          body: JSON.stringify({
            userId: session.userId,
            content: trimmed,
            stegoTier: 2,
            clientId: draft.clientId,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const body = (await response.json()) as { message: ChatMessage };
        setMessages((prev) => {
          const withoutDraft = prev.filter((message) => message.id !== draft.id);
          return mergeMessages(withoutDraft, [{ ...body.message, status: 'sent' }]);
        });
        setError(null);
      } catch {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === draft.id
              ? {
                  ...message,
                  status: 'failed',
                  error: 'Send failed. Tap retry.',
                }
              : message,
          ),
        );
        setError('Message failed to send. You can retry failed messages.');
      }
    },
    [configError],
  );

  const typingLabel = typingUsers.length
    ? `${typingUsers.slice(0, 3).join(', ')} ${typingUsers.length > 1 ? 'are' : 'is'} typing…`
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#1a1a1a' }}>
      {error ? <Text style={{ color: '#ef4444', paddingHorizontal: 12, paddingTop: 12 }}>{error}</Text> : null}
      {isReconnecting ? (
        <Text style={{ color: '#f59e0b', paddingHorizontal: 12, paddingTop: 6 }}>Reconnecting to live updates…</Text>
      ) : null}
      {typingLabel ? (
        <Text style={{ color: '#93c5fd', paddingHorizontal: 12, paddingTop: 6 }}>{typingLabel}</Text>
      ) : null}

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          hasMoreHistory ? (
            <TouchableOpacity onPress={loadOlder} disabled={isLoadingHistory} style={{ padding: 10 }}>
              <Text style={{ color: '#93c5fd', textAlign: 'center' }}>
                {isLoadingHistory ? 'Loading history…' : 'Load older messages'}
              </Text>
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item }) => {
          const isUnreadBoundary =
            unreadDividerTimestamp !== null &&
            new Date(item.createdAt).getTime() > new Date(unreadDividerTimestamp).getTime() &&
            messages.findIndex((message) => message.id === item.id) ===
              messages.findIndex(
                (message) =>
                  new Date(message.createdAt).getTime() > new Date(unreadDividerTimestamp).getTime(),
              );

          return (
            <>
              {isUnreadBoundary ? (
                <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ color: '#fca5a5', fontSize: 12 }}>Unread messages</Text>
                </View>
              ) : null}
              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: '#a3a3a3', fontSize: 12 }}>{item.userId ?? 'unknown'}</Text>
                  {item.userId && presence[item.userId] ? (
                    <Text style={{ color: presence[item.userId] === 'online' ? '#4ade80' : '#a3a3a3', fontSize: 11 }}>
                      {presence[item.userId]}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ color: '#e0e0e0', marginTop: 4 }}>{item.content}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ color: '#666', fontSize: 12 }}>{item.createdAt}</Text>
                  <Text
                    style={{
                      color:
                        item.status === 'sent'
                          ? '#86efac'
                          : item.status === 'failed'
                          ? '#fca5a5'
                          : '#93c5fd',
                      fontSize: 12,
                    }}
                  >
                    {item.status}
                  </Text>
                </View>
                {item.status === 'failed' ? (
                  <TouchableOpacity
                    onPress={() => {
                      void sendMessage(item.content, { ...item, status: 'sending', error: undefined });
                      setMessages((prev) =>
                        prev.map((message) =>
                          message.id === item.id ? { ...message, status: 'sending', error: undefined } : message,
                        ),
                      );
                    }}
                  >
                    <Text style={{ color: '#f59e0b', marginTop: 6 }}>{item.error ?? 'Retry'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          );
        }}
      />

      <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
        <TextInput
          style={{
            flex: 1,
            backgroundColor: '#2a2a2a',
            color: '#e0e0e0',
            padding: 12,
            borderRadius: 8,
          }}
          placeholder="Message"
          placeholderTextColor="#666"
          value={text}
          onChangeText={setText}
          editable={!configError}
        />
        <TouchableOpacity
          onPress={() => {
            void sendMessage(text);
          }}
          disabled={Boolean(configError)}
          style={{
            backgroundColor: configError ? '#475569' : '#1a6e3a',
            padding: 12,
            borderRadius: 8,
            justifyContent: 'center',
          }}
        >
          <Text>✈️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
