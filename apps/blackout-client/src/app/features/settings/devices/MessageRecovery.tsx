import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Text,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Dialog,
  Header,
  IconButton,
  Icon,
  Icons,
  config,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { SettingTile } from '../../../components/setting-tile';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { RecoveryKeyDisplay, SetupVerification } from '../../../components/DeviceVerificationSetup';
import { clearRecoverySkip } from '../../../state/recoverySetup';

type ProbeState = 'probing' | 'needs_setup' | 'has_backup';

export function MessageRecovery() {
  const mx = useMatrixClient();
  const [probeState, setProbeState] = useState<ProbeState>('probing');
  const [open, setOpen] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string>();

  const probe = useCallback(async (): Promise<ProbeState> => {
    const crypto = mx.getCrypto();
    if (!crypto) return 'needs_setup';
    try {
      const version = await crypto.getActiveSessionBackupVersion();
      return version ? 'has_backup' : 'needs_setup';
    } catch {
      return 'needs_setup';
    }
  }, [mx]);

  useEffect(() => {
    let cancelled = false;
    void probe().then((next) => {
      if (!cancelled) setProbeState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [probe]);

  const handleComplete = useCallback((key: string) => {
    clearRecoverySkip();
    setRecoveryKey(key);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setRecoveryKey(undefined);
    void probe().then(setProbeState);
  }, [probe]);

  if (probeState !== 'needs_setup') return null;

  return (
    <SettingTile
      title="Message Recovery"
      description="Set up a recovery key so you don't lose access to your encrypted messages if you sign out or switch devices."
      after={
        <Button size="300" radii="300" onClick={() => setOpen(true)}>
          <Text as="span" size="B300">
            Set up
          </Text>
        </Button>
      }
    >
      {open && (
        <Overlay open backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                clickOutsideDeactivates: false,
                escapeDeactivates: false,
              }}
            >
              <Dialog>
                <Header
                  style={{
                    padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                    borderBottomWidth: config.borderWidth.B300,
                  }}
                  variant="Surface"
                  size="500"
                >
                  <Box grow="Yes">
                    <Text size="H4">Set up message recovery</Text>
                  </Box>
                  <IconButton size="300" radii="300" onClick={handleClose}>
                    <Icon src={Icons.Cross} />
                  </IconButton>
                </Header>
                <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                  {recoveryKey ? (
                    <>
                      <RecoveryKeyDisplay recoveryKey={recoveryKey} />
                      <Button onClick={handleClose} variant="Primary">
                        <Text size="B400">I&apos;ve saved my recovery key</Text>
                      </Button>
                    </>
                  ) : (
                    <SetupVerification onComplete={handleComplete} />
                  )}
                </Box>
              </Dialog>
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
      )}
    </SettingTile>
  );
}
