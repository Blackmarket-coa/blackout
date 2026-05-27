import React, { MouseEventHandler, useCallback, useMemo, useState } from 'react';
import {
  Button,
  color,
  config,
  Icon,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
} from 'folds';
import { MatrixError } from 'matrix-js-sdk';
import FocusTrap from 'focus-trap-react';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../../room-settings/styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useRoom } from '../../../hooks/useRoom';
import { StateEvent } from '../../../../types/matrix/room';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useStateEvent } from '../../../hooks/useStateEvent';
import { stopPropagation } from '../../../utils/keyboard';
import { RoomPermissionsAPI } from '../../../hooks/useRoomPermissions';
import {
  SLOWMODE_STATE_EVENT_TYPE,
  parseSlowmodeConfig,
} from '../../room/slowmode';

const DELAY_OPTIONS: Array<{ seconds: number; label: string }> = [
  { seconds: 0, label: 'Off' },
  { seconds: 5, label: '5 seconds' },
  { seconds: 10, label: '10 seconds' },
  { seconds: 30, label: '30 seconds' },
  { seconds: 60, label: '1 minute' },
  { seconds: 300, label: '5 minutes' },
  { seconds: 900, label: '15 minutes' },
  { seconds: 3600, label: '1 hour' },
];

const labelForSeconds = (seconds: number): string =>
  DELAY_OPTIONS.find((option) => option.seconds === seconds)?.label ?? `${seconds} seconds`;

type RoomSlowmodeProps = {
  permissions: RoomPermissionsAPI;
};
export function RoomSlowmode({ permissions }: RoomSlowmodeProps) {
  const mx = useMatrixClient();
  const room = useRoom();

  const canEdit = permissions.stateEvent(SLOWMODE_STATE_EVENT_TYPE, mx.getSafeUserId());

  const slowmodeEvent = useStateEvent(room, SLOWMODE_STATE_EVENT_TYPE as StateEvent);
  const config_ = parseSlowmodeConfig(slowmodeEvent?.getContent<Record<string, unknown>>());

  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const [submitState, submit] = useAsyncCallback(
    useCallback(
      async (seconds: number) => {
        await mx.sendStateEvent(
          room.roomId,
          SLOWMODE_STATE_EVENT_TYPE as never,
          {
            enabled: seconds > 0,
            delaySeconds: seconds,
            exemptPowerLevel: config_.exemptPowerLevel,
          } as never
        );
      },
      [mx, room.roomId, config_.exemptPowerLevel]
    )
  );
  const submitting = submitState.status === AsyncStatus.Loading;

  const handleChange = (seconds: number) => {
    submit(seconds);
    setMenuAnchor(undefined);
  };

  const currentLabel = useMemo(
    () => (config_.enabled ? labelForSeconds(config_.delaySeconds) : 'Off'),
    [config_.enabled, config_.delaySeconds]
  );

  return (
    <SequenceCard
      className={SequenceCardStyle}
      variant="SurfaceVariant"
      direction="Column"
      gap="400"
    >
      <SettingTile
        title="Slow Mode"
        description="Limit how often members can send messages. Moderators and admins are exempt."
        after={
          <PopOut
            anchor={menuAnchor}
            position="Bottom"
            align="End"
            content={
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  returnFocusOnDeactivate: false,
                  onDeactivate: () => setMenuAnchor(undefined),
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                  isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Menu style={{ padding: config.space.S100 }}>
                  {DELAY_OPTIONS.map((option) => (
                    <MenuItem
                      key={option.seconds}
                      size="300"
                      radii="300"
                      onClick={() => handleChange(option.seconds)}
                      aria-pressed={
                        option.seconds === (config_.enabled ? config_.delaySeconds : 0)
                      }
                    >
                      <Text as="span" size="T300" truncate>
                        {option.label}
                      </Text>
                    </MenuItem>
                  ))}
                </Menu>
              </FocusTrap>
            }
          >
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
              outlined
              disabled={!canEdit || submitting}
              onClick={handleOpenMenu}
              after={
                submitting ? (
                  <Spinner size="100" variant="Secondary" />
                ) : (
                  <Icon size="100" src={Icons.ChevronBottom} />
                )
              }
            >
              <Text size="B300">{currentLabel}</Text>
            </Button>
          </PopOut>
        }
      >
        {submitState.status === AsyncStatus.Error && (
          <Text style={{ color: color.Critical.Main }} size="T200">
            {(submitState.error as MatrixError).message}
          </Text>
        )}
      </SettingTile>
    </SequenceCard>
  );
}
