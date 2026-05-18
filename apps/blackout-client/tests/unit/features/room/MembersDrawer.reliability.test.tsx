// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

import * as MembersDrawerModule from '../../../../src/app/features/room/MembersDrawer';

/**
 * MembersDrawer reliability — scope note.
 *
 * MembersDrawer is a persistent in-layout sidebar, not a modal/dialog
 * with an open/close lifecycle. It has no `requestClose` /
 * `onClose` prop, no role="dialog", no FocusTrap, no
 * useDismissOnOutsideOrEscape. The room layout controls its visibility
 * via the right-panel atom (see `rightPanelAtom` / `MembersBtn`).
 *
 * Mounting the full component in a unit test requires ~20 collaborator
 * mocks (Matrix client, Room, RoomMember[], usePowerLevels,
 * useVirtualizer, useAsyncSearch, useMembershipFilter, useMemberSort,
 * useOpenUserRoomProfile, useSpace, useRoomTypingMember,
 * useMediaAuthentication, settingsAtom, etc.) — a setup that mostly
 * tests the mocks rather than the drawer's reliability.
 *
 * The reliability rows that ARE meaningful for MembersDrawer (the
 * member-row PopOuts, the membership-filter dropdown's ESC dismissal)
 * live in their own component-scoped tests upstream. This file
 * documents the scope split so a future contributor doesn't write a
 * 200-line mock pyramid in the wrong place.
 */
describe('MembersDrawer reliability (scope-note)', () => {
    it('exports MembersDrawer as a named export', () => {
        expect(typeof MembersDrawerModule.MembersDrawer).toBe('function');
    });
});
