import React, { ReactNode } from 'react';
import FocusTrap from 'focus-trap-react';
import { Modal, Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import { stopPropagation } from '../utils/keyboard';

type Modal500Props = {
  requestClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
};
export function Modal500({ requestClose, children, ariaLabel }: Modal500Props) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: true,
            onDeactivate: requestClose,
            escapeDeactivates: stopPropagation,
            returnFocusOnDeactivate: true,
          }}
        >
          <Modal
            size="500"
            variant="Background"
            role="dialog"
            aria-modal
            aria-label={ariaLabel ?? 'Dialog'}
          >
            {children}
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
