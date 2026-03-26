// ═══════════════════════════════════════════════════════
// useRooms Hook
// Provides a reactive list of joined rooms from Matrix sync.
// ═══════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { ClientEvent } from "matrix-js-sdk";

export type RoomSummary = {
  roomId: string;
  name: string;
  avatarUrl: string | null;
  topic: string | null;
  lastMessage: string | null;
  lastMessageTs: number;
  unreadCount: number;
  isEncrypted: boolean;
  memberCount: number;
  isDirect: boolean;
};

function roomToSummary(room: Room, client: MatrixClient): RoomSummary {
  const timeline = room.getLiveTimeline().getEvents();
  const lastEvent = timeline[timeline.length - 1];

  let lastMessage: string | null = null;
  if (lastEvent) {
    const content = lastEvent.getContent();
    if (lastEvent.getType() === "m.room.message") {
      lastMessage = content.body || null;
    } else {
      lastMessage = `[${lastEvent.getType()}]`;
    }
  }

  // Check if this is a DM
  const dmMap = client.getAccountData("m.direct")?.getContent() || {};
  const isDirect = Object.values(dmMap).some((rooms: any) =>
    Array.isArray(rooms) && rooms.includes(room.roomId)
  );

  return {
    roomId: room.roomId,
    name: room.name || "Unnamed Room",
    avatarUrl: room.getAvatarUrl(client.getHomeserverUrl(), 48, 48, "crop") || null,
    topic: room.currentState.getStateEvents("m.room.topic", "")?.getContent()?.topic || null,
    lastMessage,
    lastMessageTs: lastEvent?.getTs() || 0,
    unreadCount: room.getUnreadNotificationCount("total") || 0,
    isEncrypted: room.hasEncryptionStateEvent(),
    memberCount: room.getJoinedMemberCount(),
    isDirect,
  };
}

export function useRooms(client: MatrixClient | null) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!client) {
      setRooms([]);
      setIsLoading(false);
      return;
    }

    const updateRooms = () => {
      const joinedRooms = client.getRooms()
        .filter((r) => r.getMyMembership() === "join")
        .map((r) => roomToSummary(r, client))
        .sort((a, b) => b.lastMessageTs - a.lastMessageTs);

      setRooms(joinedRooms);
      setIsLoading(false);
    };

    // Update on sync
    const onSync = (state: string) => {
      if (state === "SYNCING" || state === "PREPARED") {
        updateRooms();
      }
    };

    // Update on room events
    const onRoom = () => updateRooms();
    const onTimeline = () => updateRooms();

    client.on(ClientEvent.Sync, onSync);
    client.on(ClientEvent.Room, onRoom);
    client.on("Room.timeline" as any, onTimeline);

    // Initial load if already synced
    if (client.isInitialSyncComplete()) {
      updateRooms();
    }

    return () => {
      client.off(ClientEvent.Sync, onSync);
      client.off(ClientEvent.Room, onRoom);
      client.off("Room.timeline" as any, onTimeline);
    };
  }, [client]);

  return { rooms, isLoading };
}
