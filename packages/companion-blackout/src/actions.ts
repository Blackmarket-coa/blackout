import type { CompanionActionDefinitions } from '@companion-module/base';
import type { BlackoutInstance } from './main.js';

/**
 * Companion actions are 1:1 with OBS-WS request types implemented by
 * the Blackout shim's `dispatchRequest` matrix
 * (packages/api/src/integrations/obs-ws-compat/protocol.ts). New shim
 * requests automatically become candidates for new actions here; the
 * intersection with what's useful from a Stream Deck dictates which
 * ones we ship.
 *
 * Action ids are stable — Companion configs persist them in the
 * user's button setup, and renaming silently breaks every saved
 * profile. Don't.
 */
export const buildActions = (instance: BlackoutInstance): CompanionActionDefinitions => ({
  start_stream: {
    name: 'Start stream',
    options: [],
    callback: async () => {
      await instance.obs.call('StartStream');
    },
  },
  stop_stream: {
    name: 'Stop stream',
    options: [],
    callback: async () => {
      await instance.obs.call('StopStream');
    },
  },
  toggle_stream: {
    name: 'Toggle stream',
    options: [],
    callback: async () => {
      await instance.obs.call('ToggleStream');
    },
  },
  set_scene: {
    name: 'Set program scene',
    options: [
      {
        type: 'textinput',
        id: 'sceneName',
        label: 'Scene name',
        default: 'Live',
      },
    ],
    callback: async (event) => {
      const sceneName = String(event.options.sceneName ?? '');
      if (!sceneName) return;
      await instance.obs.call('SetCurrentProgramScene', { sceneName });
    },
  },
  toggle_mute: {
    name: 'Toggle microphone mute',
    options: [
      {
        type: 'textinput',
        id: 'inputName',
        label: 'OBS input name',
        default: 'Mic',
        tooltip:
          "The Blackout shim recognizes 'Mic', 'Microphone', and 'Desktop Audio'; other names return NotImplemented.",
      },
    ],
    callback: async (event) => {
      const inputName = String(event.options.inputName ?? 'Mic');
      await instance.obs.call('ToggleInputMute', { inputName });
    },
  },
});
