// ═══════════════════════════════════════════════════════
// useSendMessage Hook
// Send text messages, replies, reactions, and edits.
// ═══════════════════════════════════════════════════════

import { useCallback } from "react";
import type { MatrixClient } from "matrix-js-sdk";
import { EventType, MsgType, RelationType } from "matrix-js-sdk";

export function useSendMessage(client: MatrixClient | null, roomId: string | null) {
  const sendText = useCallback(
    async (body: string) => {
      if (!client || !roomId || !body.trim()) return;
      await client.sendTextMessage(roomId, body.trim());
    },
    [client, roomId]
  );

  const sendReply = useCallback(
    async (body: string, replyToEventId: string) => {
      if (!client || !roomId || !body.trim()) return;

      const room = client.getRoom(roomId);
      const replyEvent = room
        ?.getLiveTimeline()
        .getEvents()
        .find((e) => e.getId() === replyToEventId);

      if (!replyEvent) {
        // Fallback to plain text if we can't find the event
        await client.sendTextMessage(roomId, body.trim());
        return;
      }

      await client.sendMessage(roomId, {
        msgtype: MsgType.Text,
        body: `> <${replyEvent.getSender()}> ${replyEvent.getContent().body}\n\n${body.trim()}`,
        "m.relates_to": {
          "m.in_reply_to": { event_id: replyToEventId },
        },
        format: "org.matrix.custom.html",
        formatted_body: `<mx-reply><blockquote><a href="#">In reply to</a> <a href="#">${replyEvent.getSender()}</a><br>${replyEvent.getContent().body}</blockquote></mx-reply>${body.trim()}`,
      });
    },
    [client, roomId]
  );

  const sendReaction = useCallback(
    async (eventId: string, emoji: string) => {
      if (!client || !roomId) return;
      await client.sendEvent(roomId, EventType.Reaction, {
        "m.relates_to": {
          rel_type: RelationType.Annotation,
          event_id: eventId,
          key: emoji,
        },
      });
    },
    [client, roomId]
  );

  const editMessage = useCallback(
    async (eventId: string, newBody: string) => {
      if (!client || !roomId || !newBody.trim()) return;
      await client.sendMessage(roomId, {
        "m.new_content": {
          msgtype: MsgType.Text,
          body: newBody.trim(),
        },
        "m.relates_to": {
          rel_type: RelationType.Replace,
          event_id: eventId,
        },
        msgtype: MsgType.Text,
        body: `* ${newBody.trim()}`,
      });
    },
    [client, roomId]
  );

  return { sendText, sendReply, sendReaction, editMessage };
}
