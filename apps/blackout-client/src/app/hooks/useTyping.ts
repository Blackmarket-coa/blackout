import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RoomMember } from 'matrix-js-sdk';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../state/auth';
import { useMatrixClient } from './useMatrixClient';
import { useRoom } from './useRoom';

export interface HookResult<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/** Returns reactive list of currently typing members in room (excluding me). */
export const useTypingIndicator = (roomId: string): HookResult<RoomMember[]> => {
  const roomState = useRoom(roomId);
  const myUserId = useAtomValue(userIdAtom);
  const [typing, setTyping] = useState<RoomMember[]>([]);

  useEffect(() => {
    const update = () => {
      const room = roomState.data;
      if (!room) {
        setTyping([]);
        return;
      }

      const typingMembers = room
        .getMembers()
        .filter((member) => member.typing)
        .filter((member) => member.userId !== myUserId);

      setTyping(typingMembers);
    };

    update();

    const room = roomState.data;
    const emitter = room as unknown as { on?: (event: string, cb: () => void) => void; off?: (event: string, cb: () => void) => void } | null;
    emitter?.on?.('RoomMember.typing', update);
    emitter?.on?.('RoomState.events', update);

    return () => {
      emitter?.off?.('RoomMember.typing', update);
      emitter?.off?.('RoomState.events', update);
    };
  }, [myUserId, roomState.data]);

  return useMemo(
    () => ({
      data: typing,
      loading: roomState.loading,
      error: roomState.error,
    }),
    [roomState.error, roomState.loading, typing],
  );
};

/** Returns function to send typing notifications for current user. */
export const useSendTyping = (roomId: string) => {
  const client = useMatrixClient();

  return useCallback(
    async (isTyping: boolean, timeoutMs = 10_000) => {
      await client.sendTyping(roomId, isTyping, timeoutMs);
    },
    [client, roomId],
  );
};
