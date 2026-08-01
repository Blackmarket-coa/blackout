import type { MatrixClient } from 'matrix-js-sdk';
import { createRoom } from '../../components/create-room/utils';
import { CreateRoomKind } from '../../components/create-room/CreateRoomKindSelector';
import { RoomType } from '../../../types/matrix/room';
import { createCategoryInCanopy, createDenInCanopy } from '../canopy/denKind';
import { countPlanItems, type ImportPlan } from './discordStructure';

/**
 * Sequential executor for a parsed Discord import plan.
 *
 * Creation order: canopy → uncategorized dens → per category (category, then
 * its dens). Everything after the canopy is best-effort: per-item failures
 * are collected into the report and the run continues, so one denied room
 * create never aborts the whole migration. If a category fails, its dens are
 * created directly under the canopy root instead so their content is not
 * lost.
 *
 * Scope: structure only — categories, channels, channel kinds, and topics.
 * Roles and members are NOT imported (Discord user ids are not Matrix ids).
 *
 * Canopy defaults mirror the create-space modal
 * (`features/create-space/CreateSpace.tsx`) for a top-level canopy:
 * private access (invite join rule, knock off), federation allowed, no
 * encryption state (the modal never encrypts spaces), and the server's
 * default room version (capabilities `m.room_versions.default`, falling back
 * to '1'). Categories/dens go through `createCategoryInCanopy` /
 * `createDenInCanopy`, which stamp `co.bmc.den.kind`, forum defaults, and
 * announcement power levels.
 */

export type ImportStep = 'canopy' | 'category' | 'den';

export type ImportProgress = {
    /** Sequential index of the item being processed (0-based, stable per item). */
    itemIndex: number;
    /** Total number of items the run will attempt (canopy included). */
    total: number;
    step: ImportStep;
    name: string;
    status: 'creating' | 'created' | 'failed';
    error?: string;
};

export type ImportCreated = {
    step: ImportStep;
    name: string;
    roomId: string;
};

export type ImportFailed = {
    step: Exclude<ImportStep, 'canopy'>;
    name: string;
    error: string;
};

export type DiscordImportReport = {
    canopyId: string;
    created: ImportCreated[];
    failed: ImportFailed[];
};

export type ImportProgressCallback = (event: ImportProgress) => void;

const FALLBACK_ROOM_VERSION = '1';

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * Mirror of the create-space modal's room-version resolution
 * (`roomVersions?.default ?? '1'`), without the React hook: best-effort read
 * of the homeserver capabilities, falling back to '1'.
 */
const resolveDefaultRoomVersion = async (mx: MatrixClient): Promise<string> => {
    try {
        const capabilities = await mx.getCapabilities();
        return capabilities?.['m.room_versions']?.default ?? FALLBACK_ROOM_VERSION;
    } catch {
        return FALLBACK_ROOM_VERSION;
    }
};

export const runDiscordImport = async (
    mx: MatrixClient,
    plan: ImportPlan,
    onProgress?: ImportProgressCallback
): Promise<DiscordImportReport> => {
    const total = countPlanItems(plan);
    const created: ImportCreated[] = [];
    const failed: ImportFailed[] = [];
    let itemIndex = 0;

    const emit = (event: Omit<ImportProgress, 'itemIndex' | 'total'>): void => {
        onProgress?.({ ...event, itemIndex, total });
    };

    // 1. Canopy. A failure here is fatal — there is nothing to continue into —
    // so the error propagates to the caller.
    emit({ step: 'canopy', name: plan.canopyName, status: 'creating' });
    let canopyId: string;
    try {
        canopyId = await createRoom(mx, {
            version: await resolveDefaultRoomVersion(mx),
            type: RoomType.Space,
            kind: CreateRoomKind.Private,
            name: plan.canopyName,
            knock: false,
            allowFederation: true,
        });
    } catch (error) {
        emit({
            step: 'canopy',
            name: plan.canopyName,
            status: 'failed',
            error: errorMessage(error),
        });
        throw error;
    }
    created.push({ step: 'canopy', name: plan.canopyName, roomId: canopyId });
    emit({ step: 'canopy', name: plan.canopyName, status: 'created' });
    itemIndex += 1;

    const createDen = async (
        parentId: string,
        den: ImportPlan['uncategorized'][number]
    ): Promise<void> => {
        emit({ step: 'den', name: den.name, status: 'creating' });
        try {
            const denId = await createDenInCanopy(mx, {
                canopyId: parentId,
                name: den.name,
                kind: den.kind,
                topic: den.topic,
            });
            created.push({ step: 'den', name: den.name, roomId: denId });
            emit({ step: 'den', name: den.name, status: 'created' });
        } catch (error) {
            failed.push({ step: 'den', name: den.name, error: errorMessage(error) });
            emit({ step: 'den', name: den.name, status: 'failed', error: errorMessage(error) });
        }
        itemIndex += 1;
    };

    // 2. Uncategorized dens (Discord renders these above the first category).
    for (const den of plan.uncategorized) {
        await createDen(canopyId, den);
    }

    // 3. Categories, each followed by its dens.
    for (const category of plan.categories) {
        emit({ step: 'category', name: category.name, status: 'creating' });
        let categoryId: string | null = null;
        try {
            categoryId = await createCategoryInCanopy(mx, {
                canopyId,
                name: category.name,
            });
            created.push({ step: 'category', name: category.name, roomId: categoryId });
            emit({ step: 'category', name: category.name, status: 'created' });
        } catch (error) {
            failed.push({ step: 'category', name: category.name, error: errorMessage(error) });
            emit({
                step: 'category',
                name: category.name,
                status: 'failed',
                error: errorMessage(error),
            });
        }
        itemIndex += 1;

        // Fall back to the canopy root when the category could not be created
        // so the dens (and their history-to-be) are not silently dropped.
        for (const den of category.dens) {
            await createDen(categoryId ?? canopyId, den);
        }
    }

    return { canopyId, created, failed };
};
