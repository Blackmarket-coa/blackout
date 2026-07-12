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
  VERIFICATION_GATE_STATE_EVENT_TYPE,
  parseVerificationGateConfig,
} from '../../room/verificationGate';

const MEMBERSHIP_OPTIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 0, label: 'Off' },
  { minutes: 5, label: '5 minutes' },
  { minutes: 10, label: '10 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 24 * 60, label: '1 day' },
  { minutes: 7 * 24 * 60, label: '1 week' },
];

const labelForMinutes = (minutes: number): string =>
  MEMBERSHIP_OPTIONS.find((option) => option.minutes === minutes)?.label ?? `${minutes} minutes`;

type RoomVerificationGateProps = {
  permissions: RoomPermissionsAPI;
};
export function RoomVerificationGate({ permissions }: RoomVerificationGateProps) {
  const mx = useMatrixClient();
  const room = useRoom();

  const canEdit = permissions.stateEvent(VERIFICATION_GATE_STATE_EVENT_TYPE, mx.getSafeUserId());

  const gateEvent = useStateEvent(room, VERIFICATION_GATE_STATE_EVENT_TYPE as StateEvent);
  const config_ = parseVerificationGateConfig(gateEvent?.getContent<Record<string, unknown>>());

  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const [submitState, submit] = useAsyncCallback(
    useCallback(
      async (minutes: number) => {
        await mx.sendStateEvent(
          room.roomId,
          VERIFICATION_GATE_STATE_EVENT_TYPE as never,
          {
            enabled: minutes > 0 || config_.minAccountAgeHours > 0,
            minMembershipMinutes: minutes,
            // Preserve the server-enforced account-age rule untouched.
            minAccountAgeHours: config_.minAccountAgeHours,
            exemptPowerLevel: config_.exemptPowerLevel,
          } as never
        );
      },
      [mx, room.roomId, config_.minAccountAgeHours, config_.exemptPowerLevel]
    )
  );
  const submitting = submitState.status === AsyncStatus.Loading;

  const handleChange = (minutes: number) => {
    submit(minutes);
    setMenuAnchor(undefined);
  };

  const currentLabel = useMemo(
    () =>
      config_.enabled && config_.minMembershipMinutes > 0
        ? labelForMinutes(config_.minMembershipMinutes)
        : 'Off',
    [config_.enabled, config_.minMembershipMinutes]
  );

  return (
    <SequenceCard
      className={SequenceCardStyle}
      variant="SurfaceVariant"
      direction="Column"
      gap="400"
    >
      <SettingTile
        title="Verification Gate"
        description="Require a minimum membership period before new members can post. Moderators and admins are exempt."
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
                  {MEMBERSHIP_OPTIONS.map((option) => (
                    <MenuItem
                      key={option.minutes}
                      size="300"
                      radii="300"
                      onClick={() => handleChange(option.minutes)}
                      aria-pressed={
                        option.minutes === (config_.enabled ? config_.minMembershipMinutes : 0)
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
