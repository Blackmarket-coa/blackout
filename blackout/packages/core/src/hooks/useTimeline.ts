// ═══════════════════════════════════════════════════════
// useTimeline Hook
// Provides a reactive message timeline for a specific room.
// Handles pagination (loading older messages) and live updates.
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";

export type TimelineMessage = {
  eventId: string;
  sender: string;
  senderName: string;
  senderAvatar: string | null;
  content: string;
  type: string;
  timestamp: number;
  isEdited: boolean;
  replyTo: string | null;
  isOwn: boolean;
};

function eventToMessage(
  event: MatrixEvent,
  client: MatrixClient
): TimelineMessage | null {
  // Skip state events, redactions, etc
  const type = event.getType();
  if (type !== "m.room.message" && type !== "m.room.encrypted") {
    return null;
  }

  const content = event.getContent();
  const sender = event.getSender()!;
  const room = client.getRoom(event.getRoomId()!);
  const member = room?.getMember(sender);

  return {
    eventId: event.getId()!,
    sender,
    senderName: member?.name || sender,
    senderAvatar: member?.getAvatarUrl(
      client.getHomeserverUrl(), 40, 40, "crop", false, false
    ) || null,
    content: content.body || content.msgtype || "[encrypted]",
    type: content.msgtype || type,
    timestamp: event.getTs(),
    isEdited: !!content["m.new_content"],
    replyTo: content["m.relates_to"]?.["m.in_reply_to"]?.event_id || null,
    isOwn: sender === client.getUserId(),
  };
}

export function useTimeline(client: MatrixClient | null, roomId: string | null) {
  const [messages, setMessages] = useState<TimelineMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [canPaginate, setCanPaginate] = useState(true);
  const [isPaginating, setIsPaginating] = useState(false);

  // Load and listen to timeline
  useEffect(() => {
    if (!client || !roomId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    const room = client.getRoom(roomId);
    if (!room) {
      setIsLoading(false);
      return;
    }

    const loadTimeline = () => {
      const events = room
        .getLiveTimeline()
        .getEvents()
        .map((e) => eventToMessage(e, client))
        .filter(Boolean) as TimelineMessage[];

      setMessages(events);
      setIsLoading(false);
    };

    const onTimeline = (event: MatrixEvent) => {
      if (event.getRoomId() !== roomId) return;
      const msg = eventToMessage(event, client);
      if (msg) {
        setMessages((prev: TimelineMessage[]) => [...prev, msg]);
      }
    };

    client.on("Room.timeline" as any, onTimeline);
    loadTimeline();

    // Mark as read
    const lastEvent = room.getLiveTimeline().getEvents().slice(-1)[0];
    if (lastEvent) {
      client.sendReadReceipt(lastEvent).catch(() => {});
    }

    return () => {
      client.off("Room.timeline" as any, onTimeline);
    };
  }, [client, roomId]);

  // Paginate (load older messages)
  const loadMore = useCallback(async () => {
    if (!client || !roomId || isPaginating || !canPaginate) return;

    setIsPaginating(true);
    const room = client.getRoom(roomId);
    if (!room) {
      setIsPaginating(false);
      return;
    }

    try {
      const result = await client.scrollback(room, 30);
      if (!result) {
        setCanPaginate(false);
      } else {
        const events = room
          .getLiveTimeline()
          .getEvents()
          .map((e) => eventToMessage(e, client))
          .filter(Boolean) as TimelineMessage[];
        setMessages(events);
      }
    } catch {
      setCanPaginate(false);
    } finally {
      setIsPaginating(false);
    }
  }, [client, roomId, isPaginating, canPaginate]);

  return { messages, isLoading, loadMore, canPaginate, isPaginating };
}
