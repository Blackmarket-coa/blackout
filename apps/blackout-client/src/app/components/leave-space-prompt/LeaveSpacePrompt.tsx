import React, { useCallback, useEffect } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Dialog,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  Header,
  config,
  Box,
  Text,
  IconButton,
  Icon,
  Icons,
  color,
  Button,
  Spinner,
} from 'folds';
import { MatrixError } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { stopPropagation } from '../../utils/keyboard';
import { formatMatrixError } from '../../utils/matrixError';

type LeaveSpacePromptProps = {
  roomId: string;
  onDone: () => void;
  onCancel: () => void;
};
export function LeaveSpacePrompt({ roomId, onDone, onCancel }: LeaveSpacePromptProps) {
  const mx = useMatrixClient();
  const room = mx.getRoom(roomId);
  const spaceName = room?.name ?? room?.getCanonicalAlias() ?? 'this canopy';

  const [leaveState, leaveRoom] = useAsyncCallback<undefined, MatrixError, []>(
    useCallback(async () => {
      await mx.leave(roomId);
      return undefined;
    }, [mx, roomId])
  );

  const handleLeave = () => {
    leaveRoom();
  };

  const isLoading = leaveState.status === AsyncStatus.Loading;
  const isComplete = leaveState.status === AsyncStatus.Success;

  useEffect(() => {
    if (leaveState.status === AsyncStatus.Success) {
      onDone();
    }
  }, [leaveState, onDone]);

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: isLoading ? undefined : onCancel,
            clickOutsideDeactivates: !isLoading,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface">
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Leave Canopy</Text>
              </Box>
              <IconButton
                size="300"
                onClick={onCancel}
                radii="300"
                aria-label="Close, leave canopy dialog"
                disabled={isLoading}
              >
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Box direction="Column" gap="200">
                <Text priority="400">
                  Are you sure you want to leave <b>{spaceName}</b>?
                </Text>
                {leaveState.status === AsyncStatus.Error && (
                  <Text style={{ color: color.Critical.Main }} size="T300">
                    {formatMatrixError(leaveState.error, "Couldn't leave this canopy.")}
                  </Text>
                )}
              </Box>
              <Box direction="Column" gap="200">
                <Button
                  type="submit"
                  variant="Critical"
                  onClick={handleLeave}
                  disabled={isLoading || isComplete}
                  before={
                    isLoading ? (
                      <Spinner fill="Solid" variant="Critical" size="200" />
                    ) : undefined
                  }
                >
                  <Text size="B400">{isLoading ? 'Leaving...' : 'Leave'}</Text>
                </Button>
                <Button
                  variant="Secondary"
                  fill="Soft"
                  onClick={onCancel}
                  disabled={isLoading || isComplete}
                >
                  <Text size="B400">Cancel</Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
