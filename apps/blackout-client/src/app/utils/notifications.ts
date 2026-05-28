import { MatrixClient, ReceiptType } from 'matrix-js-sdk';
import { shouldSendReadReceipts } from '../features/metadata-privacy/outboundPrivacy';

export async function markAsRead(mx: MatrixClient, roomId: string, privateReceipt: boolean) {
  const room = mx.getRoom(roomId);
  if (!room) return;

  const timeline = room.getLiveTimeline().getEvents();
  const readEventId = room.getEventReadUpTo(mx.getUserId()!);

  const getLatestValidEvent = () => {
    for (let i = timeline.length - 1; i >= 0; i -= 1) {
      const latestEvent = timeline[i];
      if (latestEvent.getId() === readEventId) return null;
      if (!latestEvent.isSending()) return latestEvent;
    }
    return null;
  };
  if (timeline.length === 0) return;
  const latestEvent = getLatestValidEvent();
  if (latestEvent === null) return;

  // Force a private receipt when the caller asked for one, or when the user has
  // opted out of sending public read receipts (metadata minimization).
  const usePrivate = privateReceipt || !shouldSendReadReceipts();
  await mx.sendReadReceipt(
    latestEvent,
    usePrivate ? ReceiptType.ReadPrivate : ReceiptType.Read
  );
}
