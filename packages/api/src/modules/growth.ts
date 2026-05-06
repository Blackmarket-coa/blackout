import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { requireDomainCapability } from './authz';
import {
    ReferralValidationError,
    ambassadorService,
    questsService,
    referralService,
    type AmbassadorTier,
    type QuestRewardKind,
    type QuestSourceKind,
    type ReferralSourceKind,
} from '../services/growth';
import type { FeatureModule } from './types';

const referralCreateSchema = z.object({
    refereeUserId: z.string().min(1),
    sourceKind: z
        .enum(['invite_link', 'ambassador', 'migration_campaign', 'creator_invite'])
        .optional(),
    sourceRef: z.string().optional().nullable(),
});

const ambassadorApplySchema = z.object({
    tier: z.enum(['seedling', 'sapling', 'canopy', 'elder']).optional(),
});

const questCreateSchema = z.object({
    sourceKind: z.enum(['system', 'canopy', 'creator']),
    sourceRef: z.string().optional().nullable(),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(1000),
    rewardKind: z.enum(['tip', 'fbm_credit']),
    rewardCents: z.number().int().nonnegative(),
    startsAt: z.string().optional().nullable(),
    endsAt: z.string().optional().nullable(),
    criteria: z.record(z.unknown()).optional(),
});

function createGrowthRouter() {
    const growth = new Hono();

    // ----- Referrals --------------------------------------------------
    growth.post('/referrals', async (c) => {
        const user = requireUser(c, 'Sign in to record a referral');
        if (user instanceof Response) return user;
        const denied = requireDomainCapability(c, 'growth', 'write');
        if (denied) return denied;
        const parsed = await readJsonBody(c, referralCreateSchema);
        if (parsed instanceof Response) return parsed;
        try {
            const record = referralService.create({
                referrerUserId: user.sub,
                refereeUserId: parsed.refereeUserId,
                sourceKind: parsed.sourceKind as ReferralSourceKind | undefined,
                sourceRef: parsed.sourceRef ?? null,
            });
            return c.json({ referral: record }, 201);
        } catch (error) {
            if (error instanceof ReferralValidationError) {
                return c.json({ code: error.code, message: error.message }, 400);
            }
            throw error;
        }
    });

    growth.get('/referrals/me', (c) => {
        const user = requireUser(c, 'Sign in to view your referrals');
        if (user instanceof Response) return user;
        const denied = requireDomainCapability(c, 'growth', 'read');
        if (denied) return denied;
        return c.json({ items: referralService.listForReferrer(user.sub) });
    });

    // ----- Ambassadors -----------------------------------------------
    growth.post('/ambassadors/apply', async (c) => {
        const user = requireUser(c, 'Sign in to apply as an ambassador');
        if (user instanceof Response) return user;
        const denied = requireDomainCapability(c, 'growth', 'write');
        if (denied) return denied;
        const parsed = await readJsonBody(c, ambassadorApplySchema);
        if (parsed instanceof Response) return parsed;
        try {
            const record = ambassadorService.apply({
                userId: user.sub,
                tier: parsed.tier as AmbassadorTier | undefined,
            });
            return c.json({ ambassador: record }, 201);
        } catch (error) {
            if (error instanceof ReferralValidationError) {
                return c.json({ code: error.code, message: error.message }, 400);
            }
            throw error;
        }
    });

    growth.get('/ambassadors/me', (c) => {
        const user = requireUser(c, 'Sign in to view your ambassador status');
        if (user instanceof Response) return user;
        const denied = requireDomainCapability(c, 'growth', 'read');
        if (denied) return denied;
        const record = ambassadorService.findByUser(user.sub);
        if (!record) {
            return c.json({ ambassador: null }, 200);
        }
        return c.json({ ambassador: record });
    });

    // ----- Quests ----------------------------------------------------
    growth.get('/quests', (c) => {
        const denied = requireDomainCapability(c, 'growth', 'read');
        if (denied) return denied;
        const sourceKind = c.req.query('sourceKind');
        const filter =
            sourceKind === 'system' || sourceKind === 'canopy' || sourceKind === 'creator'
                ? { sourceKind: sourceKind as QuestSourceKind, activeAt: new Date() }
                : { activeAt: new Date() };
        return c.json({ items: questsService.list(filter) });
    });

    growth.post('/quests', async (c) => {
        const user = requireUser(c, 'Sign in to create a quest');
        if (user instanceof Response) return user;
        const denied = requireDomainCapability(c, 'growth', 'write');
        if (denied) return denied;
        const parsed = await readJsonBody(c, questCreateSchema);
        if (parsed instanceof Response) return parsed;
        try {
            const record = questsService.create({
                sourceKind: parsed.sourceKind as QuestSourceKind,
                sourceRef: parsed.sourceRef ?? null,
                title: parsed.title,
                description: parsed.description,
                rewardKind: parsed.rewardKind as QuestRewardKind,
                rewardCents: parsed.rewardCents,
                startsAt: parsed.startsAt ?? null,
                endsAt: parsed.endsAt ?? null,
                criteria: parsed.criteria,
            });
            return c.json({ quest: record }, 201);
        } catch (error) {
            if (error instanceof ReferralValidationError) {
                return c.json({ code: error.code, message: error.message }, 400);
            }
            throw error;
        }
    });

    growth.post('/quests/:id/complete', (c) => {
        const user = requireUser(c, 'Sign in to claim a quest');
        if (user instanceof Response) return user;
        const denied = requireDomainCapability(c, 'growth', 'write');
        if (denied) return denied;
        const id = c.req.param('id');
        try {
            const completion = questsService.complete(id, user.sub);
            return c.json({ completion }, 201);
        } catch (error) {
            if (error instanceof ReferralValidationError) {
                const status = error.code === 'quest_not_found' ? 404 : 400;
                return c.json({ code: error.code, message: error.message }, status);
            }
            throw error;
        }
    });

    growth.get('/quests/me/completions', (c) => {
        const user = requireUser(c, 'Sign in to view quest completions');
        if (user instanceof Response) return user;
        const denied = requireDomainCapability(c, 'growth', 'read');
        if (denied) return denied;
        return c.json({ items: questsService.listCompletionsForUser(user.sub) });
    });

    return growth;
}

export const growthModule: FeatureModule = {
    id: 'growth',
    mountPath: '/growth',
    registerRoutes: createGrowthRouter,
};
