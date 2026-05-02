import React from 'react';
import RoomTimeline from '../../room/RoomTimeline';
import MessageComposer from '../../room/MessageComposer';

export interface ChatTabProps {
    denId: string | null;
}

export function ChatTab({ denId }: ChatTabProps) {
    if (!denId) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                Select or join a Coalition den to read its timeline. From here you can switch to
                Local, Shop, or For You without leaving the canopy.
            </div>
        );
    }
    return (
        <div style={{ display: 'grid', gap: 12, padding: 16 }}>
            <section
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    height: 'min(62vh, 760px)',
                    minHeight: 360,
                    overflow: 'hidden',
                }}
            >
                <RoomTimeline roomId={denId} />
            </section>
            <MessageComposer roomId={denId} />
        </div>
    );
}

export default ChatTab;
