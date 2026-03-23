import { useCallback, useMemo, useState } from 'react';

export function useMessages(channelId: string) {
  const [messages, setMessages] = useState<Array<any>>([]);

  const sendMessage = useCallback(async (payload: any) => {
    const next = {
      id: crypto.randomUUID(),
      channelId,
      username: 'local-user',
      timestamp: new Date().toISOString(),
      ...payload,
    };

    setMessages((prev) => [...prev, next]);
    return next;
  }, [channelId]);

  const subscribe = useCallback(() => {
    return () => undefined;
  }, []);

  return useMemo(() => ({ messages, sendMessage, subscribe }), [messages, sendMessage, subscribe]);
}
