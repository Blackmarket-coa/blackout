import { describe, expect, it } from 'vitest';
import {
    CANOPY_HUB_TAB_HINTS,
    CANOPY_HUB_TAB_LABELS,
    CANOPY_HUB_TAB_ORDER,
    CANOPY_HUB_TABS,
    DEFAULT_CANOPY_HUB_TAB,
    isValidCanopyHubTab,
} from '../../../src/app/state/canopy';

describe('canopy hub tab taxonomy', () => {
    it('opens on the canopies you have already joined', () => {
        expect(DEFAULT_CANOPY_HUB_TAB).toBe('yours');
        expect(CANOPY_HUB_TAB_ORDER[0]).toBe('yours');
    });

    it('labels and hints every tab, so no tab renders blank or untitled', () => {
        CANOPY_HUB_TABS.forEach((tab) => {
            expect(CANOPY_HUB_TAB_LABELS[tab]).toBeTruthy();
            expect(CANOPY_HUB_TAB_HINTS[tab]).toBeTruthy();
        });
    });

    it('rejects unknown ids so a stale persisted tab cannot blank the hub', () => {
        expect(isValidCanopyHubTab('yours')).toBe(true);
        expect(isValidCanopyHubTab('coliseum')).toBe(false);
        expect(isValidCanopyHubTab('')).toBe(false);
    });
});
