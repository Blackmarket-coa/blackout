import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { isKeyHotkey } from 'is-hotkey';
import { voiceVideoSettingsAtom } from '../settings/settingsAtoms';
import { useCall } from './CallProvider';

export interface PttKeyEvent {
  kind: 'down' | 'up';
  /** Whether the event key matches the configured push-to-talk key. */
  matches: boolean;
  /** Whether focus is in a text-editing element (typing should not transmit). */
  inEditable: boolean;
}

export interface PttResult {
  holding: boolean;
  /** When set, the mic should be muted (true) or unmuted (false). Null = no change. */
  setMuted: boolean | null;
  preventDefault: boolean;
}

// Pure state machine for push-to-talk: held key opens the mic, release closes
// it. Auto-repeat keydowns (already holding) are no-ops so we don't thrash mute.
export const reducePtt = (holding: boolean, evt: PttKeyEvent): PttResult => {
  if (evt.kind === 'down') {
    if (!evt.matches || evt.inEditable) return { holding, setMuted: null, preventDefault: false };
    if (holding) return { holding: true, setMuted: null, preventDefault: true };
    return { holding: true, setMuted: false, preventDefault: true };
  }
  // key up
  if (!evt.matches || !holding) return { holding, setMuted: null, preventDefault: false };
  return { holding: false, setMuted: true, preventDefault: false };
};

const isEditableTarget = (): boolean => {
  const ae = document.activeElement;
  if (!ae) return false;
  const tag = ae.nodeName.toLowerCase();
  return (
    tag === 'input' || tag === 'textarea' || ae.getAttribute('contenteditable') === 'true'
  );
};

/**
 * Wires push-to-talk while a call is joined: the mic stays muted and only opens
 * while the configured key is held. Mount once inside the call UI.
 */
export const usePushToTalk = (): void => {
  const settings = useAtomValue(voiceVideoSettingsAtom);
  const { joined, setMuted } = useCall();
  const active = settings.pushToTalk && joined;
  const key = settings.pushToTalkKey || 'space';
  const holdingRef = useRef(false);

  // While PTT is active the mic defaults to muted; it only opens on key-hold.
  useEffect(() => {
    if (!active) return;
    holdingRef.current = false;
    setMuted(true);
  }, [active, setMuted]);

  useEffect(() => {
    if (!active) return undefined;

    const handle = (kind: 'down' | 'up') => (domEvent: KeyboardEvent) => {
      const result = reducePtt(holdingRef.current, {
        kind,
        matches: isKeyHotkey(key, domEvent),
        inEditable: kind === 'down' ? isEditableTarget() : false,
      });
      holdingRef.current = result.holding;
      if (result.preventDefault) domEvent.preventDefault();
      if (result.setMuted !== null) setMuted(result.setMuted);
    };

    const onDown = handle('down');
    const onUp = handle('up');
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [active, key, setMuted]);
};
