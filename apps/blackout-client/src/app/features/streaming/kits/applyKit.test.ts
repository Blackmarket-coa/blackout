import { beforeEach, describe, expect, it, vi } from 'vitest';

const createRoomMock = vi.fn();
const createTierMock = vi.fn();
const aidPoolCreateMock = vi.fn();
const fetchProfileMock = vi.fn();
const saveProfileMock = vi.fn();

vi.mock('../../../components/create-room/utils', () => ({
    createRoom: (...args: unknown[]) => createRoomMock(...args),
}));
vi.mock('../../../components/create-room/CreateRoomKindSelector', () => ({
    CreateRoomKind: { Public: 'public', Private: 'private', Restricted: 'restricted' },
}));
vi.mock('../../profile/profileClient', () => ({
    fetchProfile: (...args: unknown[]) => fetchProfileMock(...args),
    saveProfile: (...args: unknown[]) => saveProfileMock(...args),
}));
vi.mock('../../monetization/monetizationApi', () => ({
    creatorSubsApi: { createTier: (...args: unknown[]) => createTierMock(...args) },
    aidPoolsApi: { create: (...args: unknown[]) => aidPoolCreateMock(...args) },
}));
vi.mock('../../monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'test-token',
}));

import { applyCreatorKit } from './applyKit';
import type { CreatorKit } from './kitCatalog';

const mx = {
    getCapabilities: vi.fn().mockResolvedValue({ 'm.room_versions': { default: '11' } }),
} as unknown as Parameters<typeof applyCreatorKit>[1]['mx'];

const ctx = { mx, userId: '@me:server', token: 'test-token' };

const kit = (apply: CreatorKit['apply']): CreatorKit => ({
    id: 'test-kit',
    name: 'Test Kit',
    glyph: '🧪',
    tagline: 'For tests',
    configures: { profile: [], dens: [], monetization: [], streamTools: [] },
    deepLinks: [],
    apply,
});

describe('applyCreatorKit', () => {
    beforeEach(() => {
        createRoomMock.mockReset().mockResolvedValue('!room:server');
        createTierMock.mockReset().mockResolvedValue({ tier: {} });
        aidPoolCreateMock.mockReset().mockResolvedValue({ pool: {} });
        fetchProfileMock.mockReset().mockResolvedValue({ profile: { bio: 'existing' } });
        saveProfileMock.mockReset().mockResolvedValue({});
    });

    it('returns an empty list when the kit has no apply spec', async () => {
        const results = await applyCreatorKit(kit(undefined), ctx);
        expect(results).toEqual([]);
        expect(createRoomMock).not.toHaveBeenCalled();
    });

    it('provisions dens, tiers, aid pools and a merged profile', async () => {
        const results = await applyCreatorKit(
            kit({
                profile: { status: { text: 'Live soon', emoji: '🎮' } },
                dens: [{ name: 'Fan den', topic: 'community', kind: 'public' }],
                tiers: [{ name: 'Supporter', priceCents: 500, currency: 'USD' }],
                aidPools: [{ title: 'Aid pool', goalCents: 50000, currency: 'USD' }],
            }),
            ctx
        );

        // Profile is merged, not clobbered: existing bio survives, status added.
        expect(saveProfileMock).toHaveBeenCalledWith(
            '@me:server',
            { profile: { bio: 'existing', status: { text: 'Live soon', emoji: '🎮' } } },
            'test-token'
        );
        // Den created with the resolved room version + mapped kind.
        expect(createRoomMock).toHaveBeenCalledWith(
            mx,
            expect.objectContaining({ name: 'Fan den', kind: 'public', version: '11' })
        );
        expect(createTierMock).toHaveBeenCalledWith(
            { name: 'Supporter', priceCents: 500, currency: 'USD' },
            'test-token'
        );
        expect(aidPoolCreateMock).toHaveBeenCalledWith(
            { title: 'Aid pool', goalCents: 50000, currency: 'USD' },
            'test-token'
        );
        expect(results.map((r) => r.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    });

    it('marks a 403 step as skipped and still runs the rest', async () => {
        createTierMock.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
        const results = await applyCreatorKit(
            kit({
                dens: [{ name: 'Fan den', kind: 'public' }],
                tiers: [{ name: 'Supporter', priceCents: 500, currency: 'USD' }],
            }),
            ctx
        );
        const tierStep = results.find((r) => r.area === 'tier');
        const denStep = results.find((r) => r.area === 'den');
        expect(denStep?.status).toBe('ok');
        expect(tierStep?.status).toBe('skipped');
    });

    it('defaults a den with no kind to a private room', async () => {
        await applyCreatorKit(kit({ dens: [{ name: 'Private den' }] }), ctx);
        expect(createRoomMock).toHaveBeenCalledWith(
            mx,
            expect.objectContaining({ name: 'Private den', kind: 'private' })
        );
    });
});
