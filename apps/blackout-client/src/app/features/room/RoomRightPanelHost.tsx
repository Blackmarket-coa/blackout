import React from 'react';
import { Line } from 'folds';
import type { Room } from 'matrix-js-sdk';
import { useAtom } from 'jotai';
import RightPanelContent from '../right-panel/RightPanelContent';
import { useLegacyRoomTimelineAdapter as useRoomTimeline } from '../../plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';
import { rightPanelAtom, roomJumpTargetEventIdAtom } from '../../state/bmc-navigation';
import { designShellLayout, designSpacing } from '../../../../../../packages/design/src';

interface RoomRightPanelHostProps {
  room: Room;
  rolesEnabled?: boolean;
}

export function RoomRightPanelHost({ room, rolesEnabled = false }: RoomRightPanelHostProps) {
  const [rightPanel, setRightPanel] = useAtom(rightPanelAtom);
  const [, setJumpTargetEventId] = useAtom(roomJumpTargetEventIdAtom);
  const { data: timelineEvents } = useRoomTimeline(room.roomId);

  if (!rightPanel) return null;

  return (
    <>
      <Line variant="Background" direction="Vertical" size="300" />
      <aside
        aria-label="Room right panel"
        style={{
          width: designShellLayout.desktopPanelWidthPx,
          height: '100%',
          borderLeft: '1px solid var(--border-default)',
          background: 'var(--bg-surface)',
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: designSpacing.compactGapPx,
            padding: `${designSpacing.compactGapPx}px ${designSpacing.comfortableGapPx}px`,
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <strong style={{ textTransform: 'capitalize' }}>{rightPanel}</strong>
          <button type="button" onClick={() => setRightPanel(null)}>
            Close
          </button>
        </div>
        <RightPanelContent
          panel={rightPanel}
          room={room}
          events={timelineEvents}
          rolesEnabled={rolesEnabled}
          onJumpToEvent={(eventId) => {
            setJumpTargetEventId(eventId);
            setRightPanel(null);
          }}
        />
      </aside>
    </>
  );
}

export default RoomRightPanelHost;
