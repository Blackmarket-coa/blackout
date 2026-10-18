/**
 * The access choice offered when a canopy or den is created. The values are
 * the Matrix join rules they stand for, except that `Restricted` becomes
 * `restricted` to the parent canopy only when the room version supports it
 * (`createJoinRulesState` in `./utils.ts` makes the final content).
 *
 * Kept in its own module, without React, so the defaults policy
 * (`./newRoomDefaults.ts`) and the den helpers can import it without pulling
 * the chooser component in.
 */
export enum CreateRoomKind {
    Private = 'private',
    Restricted = 'restricted',
    Public = 'public',
}
