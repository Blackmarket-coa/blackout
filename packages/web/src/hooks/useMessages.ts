import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ApiMessage, websocketUrl } from '../lib/api';

export function useMessages(channelId: string) {
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;

    api.listMessages(channelId)
      .then((data) => {
        if (!cancelled) {
          setMessages(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const sendMessage = useCallback(async (payload: Record<string, unknown>) => {
    const response = await api.sendMessage(channelId, payload);

    const maybeMessage = (response as { message?: ApiMessage }).message;
    if (maybeMessage) {
      setMessages((prev) => [...prev, maybeMessage]);
      return maybeMessage;
    }

    return response;
  }, [channelId]);

  const subscribe = useCallback(() => {
    const ws = new WebSocket(websocketUrl(channelId));
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string);
        if (payload?.type === 'message' && payload.message) {
          setMessages((prev) => [...prev, payload.message as ApiMessage]);
        }
      } catch {
        // ignore malformed payloads
      }
    };

    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [channelId]);

  return useMemo(() => ({ messages, sendMessage, subscribe }), [messages, sendMessage, subscribe]);
}
