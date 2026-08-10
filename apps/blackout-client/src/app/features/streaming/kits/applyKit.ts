import type { Capabilities, MatrixClient } from 'matrix-js-sdk';
import { createRoom } from '../../../components/create-room/utils';
import { CreateRoomKind } from '../../../components/create-room/CreateRoomKindSelector';
import { fetchProfile, saveProfile } from '../../profile/profileClient';
import type { BmcProfileEvent } from '../../profile/profileTypes';
import { aidPoolsApi, creatorSubsApi } from '../../monetization/monetizationApi';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';
import type { CreatorKit, KitDenSpec } from './kitCatalog';

export type ApplyStepStatus = 'ok' | 'skipped' | 'error';

export interface ApplyStepResult {
    area: 'profile' | 'den' | 'tier' | 'aidPool';
    label: string;
    status: ApplyStepStatus;
    detail?: string;
}

export interface ApplyKitContext {
    mx: MatrixClient;
    /** The caller's own Matrix user id (`mx.getSafeUserId()`). */
    userId: string;
    /** Defaults to the persisted Blackout API token. */
    token?: string | null;
}

const KIND_MAP: Record<NonNullable<KitDenSpec['kind']>, CreateRoomKind> = {
    public: CreateRoomKind.Public,
    private: CreateRoomKind.Private,
    restricted: CreateRoomKind.Restricted,
};

/** API-client errors carry a numeric `status`; a 403 means the feature is off. */
const is403 = (err: unknown): boolean => (err as { status?: number } | null)?.status === 403;

const errText = (err: unknown): string | undefined =>
    err instanceof Error ? err.message : undefined;

const stepFor = (area: ApplyStepResult['area'], label: string, err: unknown): ApplyStepResult => ({
    area,
    label,
    status: is403(err) ? 'skipped' : 'error',
    detail: errText(err),
});

const resolveRoomVersion = async (mx: MatrixClient): Promise<string> => {
    try {
        const caps: Capabilities = await mx.getCapabilities();
        return caps['m.room_versions']?.default ?? '1';
    } catch {
        return '1';
    }
};

/**
 * Provisions a kit's concrete resources against existing mutation clients.
 * Pure orchestration (no React) so it's unit-testable. Each step is isolated:
 * a 403 (capability off) degrades to `skipped`, any other failure to `error`,
 * and the rest of the steps still run. Profile is merged so existing fields
 * are never clobbered. Returns an empty list when the kit has no `apply` spec.
 */
export async function applyCreatorKit(
    kit: CreatorKit,
    ctx: ApplyKitContext
): Promise<ApplyStepResult[]> {
    const spec = kit.apply;
    const results: ApplyStepResult[] = [];
    if (!spec) return results;

    const token = ctx.token ?? readBlackoutApiToken();

    if (spec.profile) {
        try {
            const current = await fetchProfile(ctx.userId, token);
            const merged: BmcProfileEvent = { ...current.profile, ...spec.profile };
            await saveProfile(ctx.userId, { profile: merged }, token);
            results.push({ area: 'profile', label: 'Profile', status: 'ok' });
        } catch (err) {
            results.push(stepFor('profile', 'Profile', err));
        }
    }

    if (spec.dens?.length) {
        const version = await resolveRoomVersion(ctx.mx);
        for (const den of spec.dens) {
            try {
                const denKind = KIND_MAP[den.kind ?? 'private'];
                // eslint-disable-next-line no-await-in-loop
                await createRoom(ctx.mx, {
                    version,
                    kind: denKind,
                    name: den.name,
                    topic: den.topic,
                    knock: false,
                    allowFederation: true,
                    // Omitting this left `encryption` undefined, so every
                    // kit-provisioned den — including the private ones — was
                    // created in plaintext.
                    encryption: denKind !== CreateRoomKind.Public,
                });
                results.push({ area: 'den', label: den.name, status: 'ok' });
            } catch (err) {
                results.push(stepFor('den', den.name, err));
            }
        }
    }

    if (spec.tiers?.length) {
        for (const tier of spec.tiers) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await creatorSubsApi.createTier(tier, token);
                results.push({ area: 'tier', label: tier.name, status: 'ok' });
            } catch (err) {
                results.push(stepFor('tier', tier.name, err));
            }
        }
    }

    if (spec.aidPools?.length) {
        for (const pool of spec.aidPools) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await aidPoolsApi.create(pool, token);
                results.push({ area: 'aidPool', label: pool.title, status: 'ok' });
            } catch (err) {
                results.push(stepFor('aidPool', pool.title, err));
            }
        }
    }

    return results;
}

/** localStorage key marking that a kit was applied (warns on re-apply). */
export const kitAppliedStorageKey = (kitId: string): string => `bmc-creator-kit-applied:${kitId}`;
