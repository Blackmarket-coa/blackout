// Room-scoped tip affordance. Wraps the shared monetization TipButton (which
// settles the tip through the FBM tips API) and, on success, posts a
// `co.bmc.tip` message into the room timeline so the tip is visible in chat —
// rendered as a TipEventCard. The recipient defaults to the room/space creator,
// matching the "tip the creator" surface in the Creator Hub spec.
import React, { lazy, Suspense } from 'react';
import { buildTipMessageContent, TIP_EVENT_SCHEMA_VERSION } from '@blackout/protocol';
import type { Tip } from '../monetization/monetizationApi';
import { useMatrixClient } from '../../hooks/useMatrixClient';

const TipButtonLazy = lazy(() =>
    import('../monetization/components/TipButton').then((mod) => ({ default: mod.TipButton })),
);

interface RoomTipButtonProps {
    roomId: string;
    /** Override the recipient; defaults to the room creator. */
    recipientUserId?: string;
    recipientLabel?: string;
}

export function RoomTipButton({ roomId, recipientUserId, recipientLabel }: RoomTipButtonProps) {
    const mx = useMatrixClient();
    const room = mx.getRoom(roomId);
    const recipient = recipientUserId ?? room?.getCreator() ?? undefined;
    if (!recipient) return null;

    const handleTipCreated = (tip: Tip) => {
        const fromMxid = mx.getSafeUserId();
        // Post the in-room tip event as an `m.notice` carrying a `co.bmc.tip`
        // block; non-Blackout clients still see the plaintext fallback body.
        void mx.sendEvent(
            roomId,
            'm.room.message' as never,
            buildTipMessageContent({
                schemaVersion: TIP_EVENT_SCHEMA_VERSION,
                tipId: tip.id,
                fromMxid,
                toMxid: recipient,
                amountCents: tip.grossCents,
                currency: tip.currency,
                note: tip.note ?? undefined,
                occurredAt: tip.createdAt,
            }) as never,
        );
    };

    return (
        <Suspense fallback={null}>
            <TipButtonLazy
                recipientUserId={recipient}
                recipientLabel={recipientLabel ?? room?.name ?? recipient}
                contextKind="channel_message"
                contextRef={roomId}
                compact
                onTipCreated={handleTipCreated}
            />
        </Suspense>
    );
}

export default RoomTipButton;
