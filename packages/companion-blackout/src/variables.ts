import type { CompanionVariableDefinition } from '@companion-module/base';

/**
 * Companion variables surfaced by the Blackout module. These are
 * referenced from button text overrides (e.g. `$(blackout:last_tip_amount)`).
 * Stable ids — renaming breaks every saved Companion config.
 */
export const buildVariables = (): CompanionVariableDefinition[] => [
  {
    variableId: 'is_streaming',
    name: 'Stream is live (true|false)',
  },
  {
    variableId: 'current_scene',
    name: 'Current OBS program scene name',
  },
  {
    variableId: 'last_tip_amount',
    name: 'Last tip amount (numeric)',
  },
  {
    variableId: 'last_follow_name',
    name: 'Last follower name',
  },
];
