import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { buildApiUrl, getApiConfigValidationError } from '../components/apiConfig';
import { setSession } from '../components/session';

type RegisterScreenProps = {
  onSwitchToLogin: () => void;
};

export default function RegisterScreen({ onSwitchToLogin }: RegisterScreenProps) {
  const configError = useMemo(() => getApiConfigValidationError(), []);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(configError);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (configError) {
      setError(configError);
      return;
    }
    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!acceptTerms) {
      setError('You must accept the terms to continue.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(buildApiUrl('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), username: username.trim(), password }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const body = (await response.json()) as { token: string; userId: string };
      setSession(body.token, body.userId);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 16 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 20, fontWeight: '700' }}>Create your Blackout account</Text>
        <TextInput
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={{ borderWidth: 1, padding: 12 }}
        />
        <TextInput
          placeholder="Username"
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
          style={{ borderWidth: 1, padding: 12 }}
        />
        <TextInput
          placeholder="Password (8+ characters)"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={{ borderWidth: 1, padding: 12 }}
        />
        <TextInput
          placeholder="Confirm password"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          style={{ borderWidth: 1, padding: 12 }}
        />
        <TouchableOpacity
          onPress={() => setAcceptTerms((prev) => !prev)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderWidth: 1,
              borderColor: '#1a6e3a',
              backgroundColor: acceptTerms ? '#1a6e3a' : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {acceptTerms ? <Text style={{ color: '#fff' }}>✓</Text> : null}
          </View>
          <Text>I accept the Blackout terms of service.</Text>
        </TouchableOpacity>
        {error ? <Text style={{ color: 'red' }}>{error}</Text> : null}
        <TouchableOpacity
          onPress={submit}
          disabled={submitting || Boolean(configError)}
          style={{
            backgroundColor: submitting || configError ? '#94a3b8' : '#1a6e3a',
            padding: 12,
            borderRadius: 8,
            opacity: submitting || configError ? 0.8 : 1,
          }}
        >
          <Text style={{ color: '#fff', textAlign: 'center' }}>
            {submitting ? 'Creating account…' : 'Create account'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSwitchToLogin} style={{ paddingVertical: 8 }}>
          <Text style={{ color: '#1a6e3a', textAlign: 'center' }}>
            Already have an account? Sign in
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
