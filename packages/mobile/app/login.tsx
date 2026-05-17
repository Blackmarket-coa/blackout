import { useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { buildApiUrl, getApiConfigValidationError } from '../components/apiConfig';
import { setSession } from '../components/session';
import RegisterScreen from './register';

export default function LoginScreen() {
  const configError = useMemo(() => getApiConfigValidationError(), []);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(configError);

  if (mode === 'register') {
    return <RegisterScreen onSwitchToLogin={() => setMode('login')} />;
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: '700' }}>Blackout Login</Text>
      <TextInput placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} style={{ borderWidth: 1, padding: 12 }} />
      <TextInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} style={{ borderWidth: 1, padding: 12 }} />
      {error ? <Text style={{ color: 'red' }}>{error}</Text> : null}
      <TouchableOpacity
        onPress={async () => {
          if (configError) {
            setError(configError);
            return;
          }

          setError(null);
          try {
            const response = await fetch(buildApiUrl('/auth/login'), {
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
        disabled={Boolean(configError)}
        style={{
          backgroundColor: configError ? '#94a3b8' : '#1a6e3a',
          padding: 12,
          borderRadius: 8,
          opacity: configError ? 0.8 : 1,
        }}
      >
        <Text style={{ color: '#fff' }}>Sign In</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setMode('register')} style={{ paddingVertical: 8 }}>
        <Text style={{ color: '#1a6e3a', textAlign: 'center' }}>
          New to Blackout? Create an account
        </Text>
      </TouchableOpacity>
    </View>
  );
}
