import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { getSession, subscribeSession, type SessionState } from '../components/session';
import { BugReportFab } from '../components/BugReportFab';
import LoginScreen from './login';
import ChatScreen from './(tabs)/chat';

export default function Layout() {
  const [session, setSessionState] = useState<SessionState>({ ...getSession() });

  useEffect(() => subscribeSession((next) => setSessionState({ ...next })), []);

  if (!session.token || !session.userId) {
    return <LoginScreen />;
  }

  return (
    <View style={styles.root}>
      <ChatScreen />
      <BugReportFab />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
