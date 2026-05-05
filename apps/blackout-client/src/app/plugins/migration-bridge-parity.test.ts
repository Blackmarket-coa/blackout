import { describe, expect, it } from 'vitest';
import {
    BLACKOUT_THEME_IDS as legacyThemeIds,
    normalizeThemeId as legacyNormalizeThemeId,
} from '../../lib/bmc-core/themes';
import {
    BLACKOUT_THEME_IDS as pluginThemeIds,
    normalizeThemeId as pluginNormalizeThemeId,
} from './theme/themeCatalog';
import { getMessageActions as legacyGetMessageActions } from '../../lib/bmc-core/quick-actions';
import { getMessageActions as pluginGetMessageActions } from './composer/quickActionCatalog';

describe('legacy bridge parity for modularized plugin migration', () => {
    it('keeps theme normalization parity across legacy and plugin modules', () => {
        expect(legacyThemeIds).toEqual(pluginThemeIds);
        expect(legacyNormalizeThemeId('dark')).toBe(pluginNormalizeThemeId('dark'));
        expect(legacyNormalizeThemeId('unknown')).toBe(pluginNormalizeThemeId('unknown'));
    });

    it('keeps quick-actions parity through the legacy bridge', () => {
        const event = { msgtype: 'm.text' };
        expect(legacyGetMessageActions(event)).toEqual(pluginGetMessageActions(event));
    });
});
