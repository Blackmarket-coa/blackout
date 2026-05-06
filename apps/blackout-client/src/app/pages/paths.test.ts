import { describe, expect, it } from 'vitest';
import { buildCommunitiesPath, COMMUNITIES_NO_CANOPY_SENTINEL, COMMUNITIES_PATH } from './paths';

describe('buildCommunitiesPath', () => {
    it('returns the communities root when neither canopy nor den is supplied', () => {
        expect(buildCommunitiesPath(null, null)).toBe(COMMUNITIES_PATH);
        expect(buildCommunitiesPath(undefined, undefined)).toBe(COMMUNITIES_PATH);
    });

    it('builds a canopy-only URL when no den is supplied', () => {
        expect(buildCommunitiesPath('!canopy:server', null)).toBe(
            '/communities/' + encodeURIComponent('!canopy:server')
        );
    });

    it('uses the no-canopy sentinel when a den exists without a parent canopy', () => {
        expect(buildCommunitiesPath(null, '!den:server')).toBe(
            `/communities/${COMMUNITIES_NO_CANOPY_SENTINEL}/dens/${encodeURIComponent(
                '!den:server'
            )}`
        );
    });

    it('encodes both ids and round-trips through the path shape', () => {
        const path = buildCommunitiesPath('!c with space:s', '!d:s');
        expect(path).toContain('/communities/');
        expect(path).toContain('/dens/');
        // Decoding the encoded segments returns the original ids.
        const [, , canopySegment, , denSegment] = path.split('/');
        expect(decodeURIComponent(canopySegment)).toBe('!c with space:s');
        expect(decodeURIComponent(denSegment)).toBe('!d:s');
    });
});
