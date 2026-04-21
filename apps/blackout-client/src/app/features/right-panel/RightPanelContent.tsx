import React, { useMemo } from 'react';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import type { RightPanelType } from '../../state/bmc-navigation';
import { rightPanelPlugin, resolveRightPanelSlotRegistry } from '../../plugins/right-panel';
import { designShellLayout, designSpacing } from '../../../../../../packages/design/src';

interface RightPanelContentProps {
    panel: Exclude<RightPanelType, null>;
    room: Room | null;
    events: MatrixEvent[];
    onJumpToEvent: (eventId: string) => void;
    rolesEnabled?: boolean;
}

export const RightPanelContent = ({
    panel,
    room,
    events,
    onJumpToEvent,
    rolesEnabled = false,
}: RightPanelContentProps) => {
    const registry = useMemo(
        () => resolveRightPanelSlotRegistry(rightPanelPlugin.isEnabled(), rolesEnabled),
        [rolesEnabled]
    );

    if (!room) {
        return (
            <div
                style={{
                    padding: designShellLayout.desktopPanelPaddingPx,
                    color: 'var(--text-secondary)',
                }}
            >
                Pick a room to view {panel} details.
            </div>
        );
    }

    const Renderer = registry[panel];

    if (!Renderer) {
        return (
            <div
                style={{
                    padding: designShellLayout.desktopPanelPaddingPx,
                    color: 'var(--text-secondary)',
                }}
            >
                {panel} is unavailable in this preset.
            </div>
        );
    }

    return (
        <div style={{ padding: designSpacing.comfortableGapPx }}>
            <Renderer
                key={`${panel}:${room.roomId}`}
                panel={panel}
                room={room}
                events={events}
                rolesEnabled={rolesEnabled}
                onJumpToEvent={onJumpToEvent}
            />
        </div>
    );
};

export default RightPanelContent;
