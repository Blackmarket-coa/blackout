// ═══════════════════════════════════════════════════════
// useDeepDive Hook
// Powers the DeepDive discovery feed — swipe-to-join rooms.
// Fetches public rooms from the homeserver and manages
// the swipe queue (dismiss, join, bookmark).
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import type { MatrixClient } from "matrix-js-sdk";

export type DiscoverableRoom = {
  roomId: string;
  name: string;
  topic: string | null;
  avatarUrl: string | null;
  memberCount: number;
  worldReadable: boolean;
  guestCanJoin: boolean;
};

export function useDeepDive(client: MatrixClient | null) {
  const [rooms, setRooms] = useState<DiscoverableRoom[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Fetch public rooms
  const discover = useCallback(
    async (searchTerm?: string) => {
      if (!client) return;
      setIsLoading(true);

      try {
        const response = await client.publicRooms({
          limit: 50,
          filter: searchTerm ? { generic_search_term: searchTerm } : undefined,
        });

        const joinedIds = new Set(
          client.getRooms()
            .filter((r) => r.getMyMembership() === "join")
            .map((r) => r.roomId)
        );

        const discoverable = response.chunk
          .filter((r) => !joinedIds.has(r.room_id) && !dismissed.has(r.room_id))
          .map((r) => ({
            roomId: r.room_id,
            name: r.name || "Unnamed",
            topic: r.topic || null,
            avatarUrl: r.avatar_url
              ? client.mxcUrlToHttp(r.avatar_url, 200, 200, "crop")
              : null,
            memberCount: r.num_joined_members,
            worldReadable: r.world_readable || false,
            guestCanJoin: r.guest_can_join || false,
          }));

        setRooms(discoverable);
        setCurrentIndex(0);
      } catch (err) {
        console.error("DeepDive discover failed:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [client, dismissed]
  );

  // Swipe right = join
  const join = useCallback(
    async (roomId: string) => {
      if (!client) return;
      try {
        await client.joinRoom(roomId);
      } catch (err) {
        console.error("Failed to join room:", err);
      }
      setCurrentIndex((i: number) => i + 1);
    },
    [client]
  );

  // Swipe left = dismiss
  const dismiss = useCallback((roomId: string) => {
    setDismissed((prev: Set<string>) => new Set(prev).add(roomId));
    setCurrentIndex((i: number) => i + 1);
  }, []);

  // Current room in the feed
  const currentRoom = rooms[currentIndex] || null;
  const hasMore = currentIndex < rooms.length - 1;

  return {
    currentRoom,
    hasMore,
    isLoading,
    discover,
    join,
    dismiss,
    totalAvailable: rooms.length,
  };
}
