import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { setSession } from '../components/session';

const API_BASE_URL = 'http://localhost:8787/api';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: '700' }}>Blackout Login</Text>
      <TextInput placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} style={{ borderWidth: 1, padding: 12 }} />
      <TextInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} style={{ borderWidth: 1, padding: 12 }} />
      {error ? <Text style={{ color: 'red' }}>{error}</Text> : null}
      <TouchableOpacity
        onPress={async () => {
          setError(null);
          try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password }),
            });

            if (!response.ok) {
              throw new Error(await response.text());
            }

            const body = (await response.json()) as { token: string; userId: string };
            setSession(body.token, body.userId);
          } catch (cause) {
            setError((cause as Error).message);
          }
        }}
        style={{ backgroundColor: '#1a6e3a', padding: 12, borderRadius: 8 }}
      >
        <Text style={{ color: '#fff' }}>Sign In</Text>
      </TouchableOpacity>
    </View>
  );
}
