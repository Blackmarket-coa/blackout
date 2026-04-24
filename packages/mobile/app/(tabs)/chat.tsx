import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { buildApiUrl, getApiConfigValidationError } from '../../components/apiConfig';
import { getSession } from '../../components/session';

const CHANNEL_ID = 'general';

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
}

export default function ChatScreen() {
  const configError = useMemo(() => getApiConfigValidationError(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(configError);

  useEffect(() => {
    if (configError) {
      setMessages([]);
      return;
    }

    fetch(buildApiUrl(`/messages/${CHANNEL_ID}`))
      .then((response) => response.json() as Promise<ChatMessage[]>)
      .then(setMessages)
      .catch(() => {
        setMessages([]);
        setError('Unable to load chat messages.');
      });
  }, [configError]);

  return (
    <View style={{ flex: 1, backgroundColor: '#1a1a1a' }}>
      {error ? <Text style={{ color: '#ef4444', paddingHorizontal: 12, paddingTop: 12 }}>{error}</Text> : null}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' }}>
            <Text style={{ color: '#e0e0e0', marginTop: 4 }}>{item.content}</Text>
            <Text style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{item.createdAt}</Text>
          </View>
        )}
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
          onPress={async () => {
            if (configError) {
              setError(configError);
              return;
            }

            const session = getSession();
            if (!session.userId || !text.trim()) return;

            const response = await fetch(buildApiUrl(`/messages/${CHANNEL_ID}`), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
              },
              body: JSON.stringify({
                userId: session.userId,
                content: text,
                stegoTier: 2,
              }),
            });

            if (response.ok) {
              const body = (await response.json()) as { message: ChatMessage };
              setMessages((prev) => [...prev, body.message]);
              setText('');
            }
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
