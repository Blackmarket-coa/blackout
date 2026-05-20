import React from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  config,
  Header,
  Icon,
  IconButton,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { useAllJoinedRoomsSet, useGetRoom } from '../../hooks/useGetRoom';
import { SpaceProvider } from '../../hooks/useSpace';
import { CreateSpaceForm } from './CreateSpace';
import {
  useCloseCreateSpaceModal,
  useCreateSpaceModalState,
} from '../../state/hooks/createSpaceModal';
import { CreateSpaceModalState } from '../../state/createSpaceModal';
import { stopPropagation } from '../../utils/keyboard';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

type CreateSpaceModalProps = {
  state: CreateSpaceModalState;
};
function CreateSpaceModal({ state }: CreateSpaceModalProps) {
  const { spaceId } = state;
  const closeDialog = useCloseCreateSpaceModal();
  const titleId = React.useId();

  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const space = spaceId ? getRoom(spaceId) : undefined;

  const overlay = (
    <SpaceProvider value={space ?? null}>
      <Overlay
        open
        backdrop={
          <OverlayBackdrop
            style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)' }}
          />
        }
        style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
      >
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              clickOutsideDeactivates: true,
              onDeactivate: closeDialog,
              escapeDeactivates: stopPropagation,
              returnFocusOnDeactivate: true,
            }}
          >
            <Modal
              variant="Surface"
              size="300"
              flexHeight
              role="dialog"
              aria-modal
              aria-labelledby={titleId}
              data-testid="modal-createSpace"
            >
              <Box direction="Column">
                <Header
                  variant="Surface"
                  size="500"
                  style={{
                    padding: config.space.S200,
                    paddingLeft: config.space.S400,
                    borderBottomWidth: config.borderWidth.B300,
                  }}
                >
                  <Box grow="Yes">
                    <Text id={titleId} size="H4">
                      New {BLACKOUT_TERMS.canopy.title}
                    </Text>
                  </Box>
                  <Box shrink="No">
                    <IconButton size="300" radii="300" onClick={closeDialog}>
                      <Icon src={Icons.Cross} />
                    </IconButton>
                  </Box>
                </Header>
                <Scroll size="300" hideTrack>
                  <Box
                    style={{
                      padding: config.space.S400,
                      paddingRight: config.space.S200,
                    }}
                    direction="Column"
                    gap="500"
                  >
                    <CreateSpaceForm space={space} onCreate={closeDialog} />
                  </Box>
                </Scroll>
              </Box>
            </Modal>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    </SpaceProvider>
  );

  if (typeof document === 'undefined') return overlay;
  return createPortal(overlay, document.body);
}

export function CreateSpaceModalRenderer() {
  const state = useCreateSpaceModalState();

  if (!state) return null;
  return <CreateSpaceModal state={state} />;
}
