import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { requireDomainCapability } from './authz';
import {
    ReferralValidationError,
    ambassadorService,
    migrationCreditService,
    questsService,
    referralService,
    type AmbassadorTier,
    type MigrationCreditSourceKind,
    type QuestRewardKind,
    type QuestSourceKind,
    type ReferralSourceKind,
} from '../services/growth';
import { summarizeCreatorDrivenSalesFor } from '../services/creatorDrivenSales';
import type { FeatureModule } from './types';

const referralCreateSchema = z.object({
    refereeUserId: z.string().min(1),
    sourceKind: z
        .enum(['invite_link', 'ambassador', 'migration_campaign', 'creator_invite', 'coalition'])
        .optional(),
    sourceRef: z.string().optional().nullable(),
});

const ambassadorApplySchema = z.object({
    tier: z.enum(['seedling', 'sapling', 'canopy', 'elder']).optional(),
});

const migrationCreditIssueSchema = z.object({
    sourceKind: z.enum(['discord_migration', 'twitch_migration', 'creator_invite', 'campaign']),
    sourceHandle: z.string().optional(),
    valueCents: z.number().int().nonnegative(),
    currency: z.string().min(3).max(8).optional(),
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
    criteria: z.record(z.string(), z.unknown()).optional(),
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

    // ----- Migration credits ----------------------------------------
    // PR 7. Issue is admin/campaign-driven (capability-gated on
    // `growth.write`); listing + redemption are user-scoped via the
    // existing requireUser middleware. FBM coupon issuance is deferred
    // to a follow-up PR — `fbmCreditId` stays null until the webhook
    // dispatcher lands.
    growth.post('/migration-credits', async (c) => {
        const user = requireUser(c, 'Sign in to issue a migration credit');
        if (user instanceof Response) return user;
        const denied = requireDomainCapability(c, 'growth', 'write');
        if (denied) return denied;
        const parsed = await readJsonBody(c, migrationCreditIssueSchema);
        if (parsed instanceof Response) return parsed;
        try {
            const record = migrationCreditService.issue({
                userId: user.sub,
                sourceKind: parsed.sourceKind as MigrationCreditSourceKind,
                sourceHandle: parsed.sourceHandle,
                valueCents: parsed.valueCents,
                currency: parsed.currency,
            });
            return c.json({ credit: record }, 201);
        } catch (error) {
            if (error instanceof ReferralValidationError) {
                return c.json({ code: error.code, message: error.message }, 400);
            }
            throw error;
        }
    });

    growth.get('/migration-credits/me', (c) => {
        const user = requireUser(c, 'Sign in to view your migration credits');
        if (user instanceof Response) return user;
        const denied = requireDomainCapability(c, 'growth', 'read');
        if (denied) return denied;
        return c.json({ items: migrationCreditService.listForUser(user.sub) });
    });

    growth.post('/migration-credits/:id/redeem', (c) => {
        const user = requireUser(c, 'Sign in to redeem a migration credit');
        if (user instanceof Response) return user;
        const denied = requireDomainCapability(c, 'growth', 'write');
        if (denied) return denied;
        const id = c.req.param('id');
        try {
            const record = migrationCreditService.redeem(id, user.sub);
            return c.json({ credit: record });
        } catch (error) {
            if (error instanceof ReferralValidationError) {
                const status = error.code === 'credit_not_found' ? 404 : 400;
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

    // ----- Creator-driven sales (the single KPI) ---------------------
    // The caller's own attributed sales: count + GMV + platform fee + net,
    // grouped by attribution kind (referral / ambassador / quest / bounty).
    // Optional ?since=<ISO> scopes to a window (e.g. month-to-date).
    growth.get('/creator-driven-sales', (c) => {
        const user = requireUser(c, 'Sign in to view your creator-driven sales');
        if (user instanceof Response) return user;
        const denied = requireDomainCapability(c, 'growth', 'read');
        if (denied) return denied;
        const since = c.req.query('since');
        const sinceIso = since && !Number.isNaN(Date.parse(since)) ? since : undefined;
        return c.json(summarizeCreatorDrivenSalesFor(user.sub, { sinceIso }));
    });

    return growth;
}

export const growthModule: FeatureModule = {
    id: 'growth',
    mountPath: '/growth',
    registerRoutes: createGrowthRouter,
};
