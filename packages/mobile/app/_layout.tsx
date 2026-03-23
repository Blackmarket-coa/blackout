import { useEffect, useState } from 'react';
import { getSession, subscribeSession, type SessionState } from '../components/session';
import LoginScreen from './login';
import ChatScreen from './(tabs)/chat';

export default function Layout() {
  const [session, setSessionState] = useState<SessionState>({ ...getSession() });

  useEffect(() => subscribeSession((next) => setSessionState({ ...next })), []);

  if (!session.token || !session.userId) {
    return <LoginScreen />;
  }

  return <ChatScreen />;
}
