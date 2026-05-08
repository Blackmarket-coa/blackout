import {
  combineRgb,
  type CompanionFeedbackDefinitions,
} from '@companion-module/base';
import type { BlackoutInstance } from './main.js';

/**
 * Visual feedbacks driven by Blackout's OBS-WS push events.
 * `streaming` → background turns red while a stream session is open;
 * other feedbacks are wired to the Blackout-namespaced custom events
 * the shim broadcasts on tips / follows so a Stream Deck button can
 * blink without polling.
 */
export const buildFeedbacks = (
  instance: BlackoutInstance,
): CompanionFeedbackDefinitions => ({
  streaming: {
    type: 'boolean',
    name: 'Stream is live',
    description: 'Highlights the button while the Blackout shim reports an active stream session.',
    defaultStyle: {
      bgcolor: combineRgb(220, 32, 32),
      color: combineRgb(255, 255, 255),
    },
    options: [],
    callback: () => instance.isStreaming,
  },
});
