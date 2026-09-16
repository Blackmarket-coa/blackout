// Coalitions network — `/v1/coalitions`.
//
// Multi-member groups that replace the friends list. Distinct from the
// per-canopy mutual-aid hub that keeps `/v1/coalition` (singular). Every
// permission check happens in services/coalitionNetworkStore.ts against the
// membership rows; nothing here trusts a client-asserted role.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
    CAMPAIGN_STATUSES,
    CAMPAIGN_TYPES,
    COALITION_PLATFORMS,
    isInstanceHost,
    COALITION_PLATFORM_CAPABILITIES,
    CONNECTION_AUTH_MODES,
    COALITION_JOIN_MODES,
    COALITION_ROLES,
    COALITION_ROLE_LABELS,
    COALITION_ROLE_PERMISSIONS,
    COALITION_TIER_GATES,
} from '@blackout/core';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { getAuthUser, requireUser } from '../middleware/require-user';
import { matrixUserIdFor, resolveBlackoutUserId } from '../services/userIdentity';
import { isPubliclyListed } from '../services/profileStore';
import { isAdminUser } from '../services/auth';
import {
    activeMembership,
    approveCampaign,
    archiveCoalition,
    boostCampaign,
    campaignBoostMeter,
    createCampaign,
    createCoalition,
    getCampaign,
    getCoalition,
    getCoalitionView,
    inviteMember,
    leaveCoalition,
    listCoalitions,
    listInvitesFor,
    listJoinRequests,
    listUserCoalitions,
    removeMember,
    requestJoin,
    reviewJoinRequest,
    setMemberRole,
    transferFounder,
    transitionCampaign,
    listAmplifiedAid,
    getSuccessionPetition,
    listCampaignPayees,
    openSuccessionPetition,
    reinstateCoalition,
    secondSuccessionPetition,
    takeDownCoalition,
    withdrawSuccessionPetition,
    raiseAidPost,
    redactCampaignIdentities,
    setCampaignPayees,
    updateCoalition,
    withdrawJoinRequest,
    type CoalitionError,
} from '../services/coalitionNetworkStore';
import {
    listContributions,
    previewContribution,
    startContribution,
} from '../services/coalitionDrives';
import {
    checkGuardrails,
    connectPlatform,
    campaignAppUrl,
    campaignShareUrl,
    crosspostCampaign,
    shareCampaign,
    linkMemberAccount,
    listApprovedActivity,
    listCampaignPosts,
    listConnections,
    listOptIns,
    listPendingActivity,
    moderateActivity,
    setOptIn,
    type SyncError,
} from '../services/coalitionSync';

const coalitions = new Hono();

/** Map a service error onto an HTTP response with a stable `code`. */
function errorResponse(c: Parameters<typeof requireUser>[0], error: CoalitionError): Response {
    switch (error.kind) {
        case 'not_found':
            return c.json({ code: 'not_found', message: 'Coalition not found' }, 404);
        case 'archived':
            return c.json({ code: 'archived', message: 'This coalition has been archived' }, 410);
        case 'forbidden':
            return c.json(
                {
                    code: 'forbidden',
                    message: error.permission
                        ? `Your coalition role does not grant ${error.permission}`
                        : 'Not allowed',
                    permission: error.permission,
                },
                403
            );
        case 'not_member':
            return c.json(
                { code: 'not_member', message: 'You are not a member of this coalition' },
                403
            );
        case 'already_member':
            return c.json({ code: 'already_member', message: 'Already a member' }, 409);
        case 'approval_required':
            return c.json({ code: 'approval_required', request: error.request }, 202);
        case 'tier_gate':
            return c.json(
                {
                    code: 'tier_gate',
                    message: `This coalition asks for ${error.required} or above`,
                    required: error.required,
                    actual: error.actual,
                },
                403
            );
        case 'taken_down':
            return c.json(
                {
                    code: 'taken_down',
                    message: 'This coalition has been taken down by the platform',
                },
                403
            );
        case 'petition_open':
            return c.json(
                { code: 'petition_open', message: 'A succession petition is already open' },
                409
            );
        case 'petition_not_found':
            return c.json(
                { code: 'petition_not_found', message: 'No open succession petition' },
                404
            );
        case 'quorum_not_met':
            return c.json(
                {
                    code: 'quorum_not_met',
                    message: `${error.needed} stewards must back this; ${error.have} have`,
                    needed: error.needed,
                    have: error.have,
                },
                409
            );
        case 'payees_invalid':
            return c.json(
                {
                    code: 'payees_invalid',
                    message:
                        'Every payee must be a member, listed once, and the shares must total 100%',
                    reason: error.reason,
                },
                400
            );
        case 'invalid_role':
            return c.json(
                { code: 'invalid_role', message: 'That role cannot be assigned here' },
                400
            );
        case 'last_founder':
            return c.json(
                { code: 'last_founder', message: 'Transfer the founder role before leaving' },
                409
            );
        case 'invalid_transition':
            return c.json(
                {
                    code: 'invalid_transition',
                    message: `Cannot move a ${error.from} campaign to ${error.to}`,
                    from: error.from,
                    to: error.to,
                },
                409
            );
        case 'campaign_inactive':
            return c.json(
                { code: 'campaign_inactive', message: 'Only active campaigns can be boosted' },
                409
            );
        case 'boost_allowance_exhausted':
            return c.json(
                {
                    code: 'boost_allowance_exhausted',
                    message: `You have used today's ${error.allowance} boosts`,
                    allowance: error.allowance,
                },
                429
            );
        case 'already_boosted':
            return c.json(
                { code: 'already_boosted', message: 'You already boosted this today' },
                409
            );
    }
}

/** Resolve a member into a client-friendly shape (username + Matrix id for the profile surface). */
const resolveUser = (userId: string) => {
    const user = db.getUserById(userId);
    return {
        userId,
        username: user?.username ?? userId,
        matrixUserId: matrixUserIdFor(userId),
    };
};

const listQuery = z.object({
    memberId: z.string().min(1).max(255).optional(),
    q: z.string().max(120).optional(),
    mine: z.enum(['1', 'true']).optional(),
});

coalitions.get('/', (c) => {
    const query = listQuery.safeParse(c.req.query());
    if (!query.success) {
        return c.json(
            { code: 'invalid_request', message: 'Query parameters failed validation' },
            400
        );
    }
    const viewer = getAuthUser(c);
    let memberId: string | undefined;
    if (query.data.mine) {
        const user = requireUser(c);
        if (user instanceof Response) return user;
        memberId = user.sub;
    } else if (query.data.memberId) {
        const resolved = resolveBlackoutUserId(query.data.memberId);
        if (!resolved) return c.json({ coalitions: [] });
        memberId = resolved;
    }
    const rows = listCoalitions({ memberId, q: query.data.q }, viewer?.sub);
    return c.json({ coalitions: rows });
});

/** Vocabulary the client renders from — one source of truth for roles and permissions. */
coalitions.get('/meta', (c) =>
    c.json({
        roles: COALITION_ROLES.map((role) => ({
            role,
            label: COALITION_ROLE_LABELS[role],
            permissions: COALITION_ROLE_PERMISSIONS[role],
        })),
        joinModes: COALITION_JOIN_MODES,
        tierGates: COALITION_TIER_GATES,
        campaignTypes: CAMPAIGN_TYPES,
        campaignStatuses: CAMPAIGN_STATUSES,
    })
);

/** Invitations addressed to the caller. */
coalitions.get('/invites/mine', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({
        invites: listInvitesFor(user.sub).map(({ request, coalition }) => ({
            request,
            coalition,
            invitedBy: request.invitedBy ? resolveUser(request.invitedBy) : null,
        })),
    });
});

/** A user's coalitions, for the profile page (accepts a Matrix id or a Blackout id). */
coalitions.get('/users/:userId', (c) => {
    const userId = resolveBlackoutUserId(c.req.param('userId'));
    if (!userId) return c.json({ code: 'not_found', message: 'User not found' }, 404);
    const viewer = getAuthUser(c);
    return c.json({ coalitions: listUserCoalitions(userId, viewer?.sub) });
});

/**
 * Whether the caller is inside this coalition, for the read projections that
 * carry member identity. `:id` may be a slug, so it resolves through
 * `getCoalition` rather than being used as an id directly.
 */
function viewerIsMember(c: Context): boolean {
    const viewer = getAuthUser(c);
    if (!viewer) return false;
    const idOrSlug = c.req.param('id');
    const coalition = idOrSlug ? getCoalition(idOrSlug) : undefined;
    return Boolean(coalition && activeMembership(coalition.id, viewer.sub));
}

const createSchema = z.object({
    name: z.string().min(2).max(80),
    mission: z.string().min(1).max(2000),
    bannerUrl: z.string().url().max(512).optional(),
    joinMode: z.enum(COALITION_JOIN_MODES).default('open'),
    minTierToJoin: z.enum(COALITION_TIER_GATES).optional(),
});

coalitions.post('/', async (c) => {
    const user = requireUser(c, 'Sign in to found a coalition');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createSchema);
    if (parsed instanceof Response) return parsed;
    const created = await createCoalition({ ...parsed, createdBy: user.sub });
    return c.json(
        {
            coalition: created.coalition,
            membership: created.membership,
            memberCount: 1,
            space: created.space,
        },
        201
    );
});

coalitions.get('/platforms', (c) =>
    c.json({
        platforms: COALITION_PLATFORMS.map((platform) => ({
            platform,
            ...COALITION_PLATFORM_CAPABILITIES[platform],
        })),
        authModes: CONNECTION_AUTH_MODES,
    })
);

coalitions.get('/:id/connections', (c) => {
    const viewer = getAuthUser(c);
    const view = getCoalitionView(c.req.param('id'), viewer?.sub);
    if (!view.ok) return errorResponse(c, view.error);
    return c.json({ connections: listConnections(view.value.coalition.id, viewer?.sub) });
});

/**
 * Platform authority. Deliberately NOT `requireDomainCapability`, which merges
 * capabilities asserted in a request header — any concrete scope there is
 * self-assertable, so it gates nothing an attacker cares about.
 */
const requireModerator = (c: Context) => {
    const user = requireUser(c, 'Sign in required');
    if (user instanceof Response) return user;
    if (!isAdminUser(user.sub, user.username)) {
        return c.json({ code: 'forbidden', message: 'Moderator privileges required' }, 403);
    }
    return user;
};

const takedownSchema = z.object({ reason: z.string().min(1).max(500) });

coalitions.post('/:id/takedown', async (c) => {
    const user = requireModerator(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, takedownSchema);
    if (parsed instanceof Response) return parsed;
    const result = await takeDownCoalition(c.req.param('id'), user.sub, parsed.reason);
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ coalition: result.value });
});

coalitions.post('/:id/reinstate', async (c) => {
    const user = requireModerator(c);
    if (user instanceof Response) return user;
    const result = await reinstateCoalition(c.req.param('id'), user.sub);
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ coalition: result.value });
});

// --- succession: taking over from a founder who has gone ---

const petitionSchema = z.object({ reason: z.string().min(1).max(1000) });

coalitions.get('/:id/succession', (c) => {
    const result = getSuccessionPetition(c.req.param('id'));
    if (!result.ok) return errorResponse(c, result.error);
    return c.json(result.value);
});

coalitions.post('/:id/succession', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, petitionSchema);
    if (parsed instanceof Response) return parsed;
    const result = openSuccessionPetition(c.req.param('id'), user.sub, parsed.reason);
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ petition: result.value }, 201);
});

coalitions.post('/:id/succession/second', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const result = await secondSuccessionPetition(c.req.param('id'), user.sub);
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ petition: result.value });
});

coalitions.post('/:id/succession/withdraw', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const result = withdrawSuccessionPetition(c.req.param('id'), user.sub);
    if (!result.ok) return errorResponse(c, result.error);
    return c.json({ petition: result.value });
});

coalitions.get('/:id', (c) => {
    const viewer = getAuthUser(c);
    const view = getCoalitionView(c.req.param('id'), viewer?.sub);
    if (!view.ok) return errorResponse(c, view.error);
    return c.json({
        ...view.value,
        members: view.value.members.map((m) => ({ ...m, ...resolveUser(m.userId) })),
    });
});

const updateSchema = z.object({
    name: z.string().min(2).max(80).optional(),
    mission: z.string().min(1).max(2000).optional(),
    bannerUrl: z.string().url().max(512).nullable().optional(),
    joinMode: z.enum(COALITION_JOIN_MODES).optional(),
    minTierToJoin: z.enum(COALITION_TIER_GATES).nullable().optional(),
});

coalitions.patch('/:id', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, updateSchema);
    if (parsed instanceof Response) return parsed;
    const updated = await updateCoalition(c.req.param('id'), user.sub, parsed);
    if (!updated.ok) return errorResponse(c, updated.error);
    return c.json({ coalition: updated.value });
});

coalitions.post('/:id/archive', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const archived = archiveCoalition(c.req.param('id'), user.sub);
    if (!archived.ok) return errorResponse(c, archived.error);
    return c.json({ coalition: archived.value });
});

const joinSchema = z.object({ message: z.string().max(500).optional() }).default({});

coalitions.post('/:id/join', async (c) => {
    const user = requireUser(c, 'Sign in to join a coalition');
    if (user instanceof Response) return user;
    // The body is optional: an open-mode join sends none, an approval-mode
    // request may carry a note for the stewards.
    let message: string | undefined;
    const raw = (await c.req.text()).trim();
    if (raw.length > 0) {
        let body: unknown;
        try {
            body = JSON.parse(raw);
        } catch {
            return c.json(
                { code: 'invalid_request', message: 'Request body must be valid JSON' },
                400
            );
        }
        const parsed = joinSchema.safeParse(body);
        if (!parsed.success) {
            return c.json(
                { code: 'invalid_request', message: 'Request body failed validation' },
                400
            );
        }
        message = parsed.data.message;
    }
    const outcome = await requestJoin(c.req.param('id'), user.sub, message);
    if (!outcome.ok) return errorResponse(c, outcome.error);
    if (outcome.value.joined) {
        return c.json({ joined: true, membership: outcome.value.membership });
    }
    return c.json({ joined: false, request: outcome.value.request }, 202);
});

coalitions.post('/:id/leave', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const left = await leaveCoalition(c.req.param('id'), user.sub);
    if (!left.ok) return errorResponse(c, left.error);
    return c.json({ membership: left.value });
});

coalitions.get('/:id/requests', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const queue = listJoinRequests(c.req.param('id'), user.sub);
    if (!queue.ok) return errorResponse(c, queue.error);
    return c.json({
        requests: queue.value.map((request) => ({ ...request, user: resolveUser(request.userId) })),
    });
});

coalitions.post('/:id/requests/withdraw', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const withdrawn = withdrawJoinRequest(c.req.param('id'), user.sub);
    if (!withdrawn.ok) return errorResponse(c, withdrawn.error);
    return c.json({ request: withdrawn.value });
});

for (const decision of ['approve', 'decline'] as const) {
    coalitions.post(`/:id/requests/:userId/${decision}`, async (c) => {
        const user = requireUser(c);
        if (user instanceof Response) return user;
        const target = resolveBlackoutUserId(c.req.param('userId'));
        if (!target) return c.json({ code: 'not_found', message: 'User not found' }, 404);
        const reviewed = await reviewJoinRequest(c.req.param('id'), user.sub, target, decision);
        if (!reviewed.ok) return errorResponse(c, reviewed.error);
        return c.json(reviewed.value);
    });
}

const inviteSchema = z.object({ userId: z.string().min(1).max(255) });

coalitions.post('/:id/invites', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, inviteSchema);
    if (parsed instanceof Response) return parsed;
    const target = resolveBlackoutUserId(parsed.userId);
    if (!target) return c.json({ code: 'not_found', message: 'User not found' }, 404);
    const invited = inviteMember(c.req.param('id'), user.sub, target);
    if (!invited.ok) return errorResponse(c, invited.error);
    return c.json({ request: invited.value }, 201);
});

const roleSchema = z.object({ role: z.enum(COALITION_ROLES) });

coalitions.patch('/:id/members/:userId', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, roleSchema);
    if (parsed instanceof Response) return parsed;
    const target = resolveBlackoutUserId(c.req.param('userId'));
    if (!target) return c.json({ code: 'not_found', message: 'User not found' }, 404);
    const updated = await setMemberRole(c.req.param('id'), user.sub, target, parsed.role);
    if (!updated.ok) return errorResponse(c, updated.error);
    return c.json({ membership: updated.value });
});

coalitions.delete('/:id/members/:userId', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const target = resolveBlackoutUserId(c.req.param('userId'));
    if (!target) return c.json({ code: 'not_found', message: 'User not found' }, 404);
    const removed = await removeMember(c.req.param('id'), user.sub, target);
    if (!removed.ok) return errorResponse(c, removed.error);
    return c.json({ membership: removed.value });
});

coalitions.post('/:id/transfer', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, inviteSchema);
    if (parsed instanceof Response) return parsed;
    const target = resolveBlackoutUserId(parsed.userId);
    if (!target) return c.json({ code: 'not_found', message: 'User not found' }, 404);
    const transferred = await transferFounder(c.req.param('id'), user.sub, target);
    if (!transferred.ok) return errorResponse(c, transferred.error);
    return c.json(transferred.value);
});

// --- campaigns ---

const campaignSchema = z.object({
    type: z.enum(CAMPAIGN_TYPES),
    title: z.string().min(1).max(160),
    description: z.string().max(4000).default(''),
    goalCents: z.number().int().min(0).max(100_000_000_00).optional(),
    goalUnits: z.number().int().min(0).max(1_000_000).optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    requiresStewardApproval: z.boolean().optional(),
    projectId: z.string().max(120).optional(),
    bountyId: z.string().max(120).optional(),
    aidPostId: z.string().max(120).optional(),
    // `fbmListingId` and `fbmOrderCycleId` are deliberately NOT accepted
    // here. They decide which FBM listing takes a contributor's money and
    // which ordering window a goods drive opens, so a client-supplied value
    // is a way to point a coalition's fundraising at somebody else's
    // listing. Both are written server-side only: the order cycle id by the
    // FBM bridge, the listing id by the drive-listing path when it exists.

    // Post the project to the Creator Hub bounty board as the coalition.
    bounty: z
        .object({
            rewardType: z.enum([
                'cash',
                'revenue_share',
                'product_token',
                'store_credit',
                'digital_product',
            ]),
            rewardSummary: z.string().min(1).max(200),
            rewardAmountCents: z.number().int().min(0).max(100_000_000).optional(),
            requirements: z.array(z.string().max(500)).max(20).optional(),
            deliverables: z.array(z.string().max(500)).max(20).optional(),
        })
        .optional(),
});

coalitions.get('/:id/campaigns', (c) => {
    const viewer = getAuthUser(c);
    const view = getCoalitionView(c.req.param('id'), viewer?.sub);
    if (!view.ok) return errorResponse(c, view.error);
    return c.json({
        campaigns: view.value.campaigns.map((campaign) => ({
            ...campaign,
            boost: campaignBoostMeter(campaign.id),
        })),
    });
});

coalitions.post('/:id/campaigns', async (c) => {
    const user = requireUser(c, 'Sign in to launch a campaign');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, campaignSchema);
    if (parsed instanceof Response) return parsed;
    const created = createCampaign(c.req.param('id'), user.sub, parsed);
    if (!created.ok) return errorResponse(c, created.error);
    return c.json({ campaign: created.value }, 201);
});

coalitions.get('/:id/campaigns/:campaignId', (c) => {
    const viewer = getAuthUser(c);
    const campaign = getCampaign(c.req.param('id'), c.req.param('campaignId'), viewer?.sub);
    if (!campaign.ok) return errorResponse(c, campaign.error);
    return c.json({ campaign: campaign.value, boost: campaignBoostMeter(campaign.value.id) });
});

coalitions.post('/:id/campaigns/:campaignId/approve', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const approved = approveCampaign(c.req.param('id'), user.sub, c.req.param('campaignId'));
    if (!approved.ok) return errorResponse(c, approved.error);
    return c.json({ campaign: approved.value });
});

const statusSchema = z.object({ status: z.enum(CAMPAIGN_STATUSES) });

const payeesSchema = z.object({
    payees: z
        .array(
            z.object({
                userId: z.string().min(1).max(255),
                shareBps: z.number().int().min(0).max(10_000),
                role: z.string().min(1).max(40),
            })
        )
        .min(1)
        .max(20),
});

/**
 * Who a campaign's money divides among. Stewards set it; contributors never do
 * — a client-chosen payee would be a way to redirect somebody else's donation.
 */
coalitions.post('/:id/campaigns/:campaignId/payees', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, payeesSchema);
    if (parsed instanceof Response) return parsed;
    const saved = setCampaignPayees(
        c.req.param('id'),
        user.sub,
        c.req.param('campaignId'),
        parsed.payees
    );
    if (!saved.ok) return errorResponse(c, saved.error);
    return c.json({ payees: saved.value.map((row) => ({ ...row, ...resolveUser(row.userId) })) });
});

coalitions.get('/:id/campaigns/:campaignId/payees', (c) => {
    const viewer = getAuthUser(c);
    const campaign = getCampaign(c.req.param('id'), c.req.param('campaignId'), viewer?.sub);
    if (!campaign.ok) return errorResponse(c, campaign.error);
    // Who a public drive pays is part of what a contributor is agreeing to, so
    // this is readable — but a payee who opted out of public listing is named
    // only to the coalition.
    const insider = viewerIsMember(c);
    return c.json({
        payees: listCampaignPayees(campaign.value.id)
            .filter((row) => insider || isPubliclyListed(row.userId))
            .map((row) => ({ ...row, ...resolveUser(row.userId) })),
    });
});

coalitions.post('/:id/campaigns/:campaignId/status', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, statusSchema);
    if (parsed instanceof Response) return parsed;
    const moved = transitionCampaign(
        c.req.param('id'),
        user.sub,
        c.req.param('campaignId'),
        parsed.status
    );
    if (!moved.ok) return errorResponse(c, moved.error);
    return c.json({ campaign: moved.value });
});

coalitions.post('/:id/campaigns/:campaignId/boost', async (c) => {
    const user = requireUser(c, 'Sign in to boost');
    if (user instanceof Response) return user;
    const boosted = await boostCampaign(c.req.param('id'), user.sub, c.req.param('campaignId'));
    if (!boosted.ok) return errorResponse(c, boosted.error);
    return c.json(boosted.value);
});

// --- drives: the money leg ---

const contributeSchema = z.object({
    // Dollars-in-cents, matching every other money route in the API.
    amountCents: z.number().int().min(100).max(100_000_00),
    currency: z.string().min(3).max(8).optional(),
    note: z.string().max(280).optional(),
    returnUrl: z.string().url().max(512).optional(),
    embed: z.boolean().optional(),
});

/**
 * Contribute to a drive. Records a pending tip with the flat 3% split and
 * opens the FBM checkout that captures it — Blackout never takes the money
 * itself. The response carries the checkout URL; when no checkout could be
 * opened it says so rather than implying the contribution went through.
 */
coalitions.post('/:id/campaigns/:campaignId/contribute', async (c) => {
    const user = requireUser(c, 'Sign in to contribute');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, contributeSchema);
    if (parsed instanceof Response) return parsed;
    const campaign = getCampaign(c.req.param('id'), c.req.param('campaignId'), user.sub);
    if (!campaign.ok) return errorResponse(c, campaign.error);
    if (campaign.value.status !== 'active') {
        return c.json(
            { code: 'campaign_inactive', message: 'This campaign is not taking contributions' },
            409
        );
    }
    const origin = c.req.header('origin');
    try {
        const result = await startContribution({
            campaign: campaign.value,
            supporterUserId: user.sub,
            ...(campaign.value.beneficiaryUserId
                ? { beneficiaryUserId: campaign.value.beneficiaryUserId }
                : {}),
            grossCents: parsed.amountCents,
            ...(parsed.currency ? { currency: parsed.currency } : {}),
            ...(parsed.note ? { note: parsed.note } : {}),
            ...(parsed.returnUrl ? { returnUrl: parsed.returnUrl } : {}),
            ...(parsed.embed ? { embed: true } : {}),
            ...(origin ? { embedOrigin: origin } : {}),
        });
        if (!result.tip) {
            // Nothing was recorded, so this is not a created contribution.
            // Answering 201 here told the contributor their money was on its
            // way when no checkout existed to take it.
            return c.json(
                {
                    code: 'contributions_unavailable',
                    message:
                        result.checkoutError === 'no_beneficiary'
                            ? 'This request has no one to pay — it was mirrored from another platform'
                            : 'This drive cannot take contributions right now',
                    reason: result.checkoutError ?? 'no_listing',
                    split: result.split,
                },
                503
            );
        }
        return c.json(
            {
                tipId: result.tip.id,
                status: result.tip.status,
                split: result.split,
                redirectUrl: result.redirectUrl,
                sessionId: result.sessionId,
                embed: result.embed,
                ...(result.checkoutError ? { checkoutError: result.checkoutError } : {}),
            },
            201
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not start the contribution';
        return c.json({ code: 'contribution_failed', message }, 400);
    }
});

/** What a contribution of this size splits into, before committing to it. */
coalitions.get('/:id/campaigns/:campaignId/contribution-preview', (c) => {
    const amount = Number.parseInt(c.req.query('amountCents') ?? '', 10);
    if (!Number.isInteger(amount) || amount < 100) {
        return c.json(
            { code: 'invalid_request', message: 'amountCents must be at least 100' },
            400
        );
    }
    return c.json({ split: previewContribution(amount) });
});

/** The supporter wall: captured contributions, newest first. */
coalitions.get('/:id/campaigns/:campaignId/contributions', (c) => {
    const viewer = getAuthUser(c);
    const campaign = getCampaign(c.req.param('id'), c.req.param('campaignId'), viewer?.sub);
    if (!campaign.ok) return errorResponse(c, campaign.error);
    // A public supporter wall carries a name next to an amount. For a viewer
    // outside the coalition, a supporter who opted out of public listing is
    // DROPPED rather than shown as an anonymous placeholder: the campaign's
    // `raisedCents` and `contributorCount` are public too, so a placeholder
    // beside an amount can be subtracted back out and attributed.
    const insider = viewerIsMember(c);
    return c.json({
        contributions: listContributions(campaign.value.id)
            .filter((row) => insider || isPubliclyListed(row.supporterUserId))
            .map((row) => ({
                ...row,
                supporter: resolveUser(row.supporterUserId),
            })),
    });
});

// --- amplification: raising a mutual-aid request to the coalition ---

const raiseSchema = z.object({ aidPostId: z.string().min(1).max(120) });

/**
 * Raise a mutual-aid post to this coalition. Creates a `mutual_aid` campaign
 * pointing at the post; members then boost it, and the boost meter's
 * visibility multiplier — the same acceleration a project Surge uses — lifts
 * it. The post itself is never copied.
 */
coalitions.post('/:id/raise-aid', async (c) => {
    const user = requireUser(c, 'Sign in to raise a request');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, raiseSchema);
    if (parsed instanceof Response) return parsed;
    const raised = raiseAidPost(c.req.param('id'), user.sub, parsed.aidPostId);
    if (!raised.ok) return errorResponse(c, raised.error);
    return c.json({ campaign: raised.value }, 201);
});

/** Raised aid, most-amplified first. */
coalitions.get('/:id/amplified', (c) => {
    const amplified = listAmplifiedAid(c.req.param('id'));
    if (!amplified.ok) return errorResponse(c, amplified.error);
    // `campaign.createdBy` here is the member who raised a neighbour's request
    // for help. Outside the coalition that is the single most sensitive id in
    // the feature, and this route answered anonymous callers.
    const insider = viewerIsMember(c);
    return c.json({
        amplified: insider
            ? amplified.value
            : amplified.value.map((row) => ({
                  ...row,
                  campaign: redactCampaignIdentities(row.campaign),
              })),
    });
});

/**
 * Widget-safe public view of an active drive, for the connect.js embed on a
 * member's own site. Deliberately narrow: name, mission, goal, progress and a
 * canonical URL — no member roster, no contributor identities, no internal ids
 * beyond the ones the embed must quote back at checkout.
 */
coalitions.get('/:id/campaigns/:campaignId/public', (c) => {
    const view = getCoalitionView(c.req.param('id'));
    if (!view.ok) return errorResponse(c, view.error);
    const campaign = view.value.campaigns.find((row) => row.id === c.req.param('campaignId'));
    if (!campaign || (campaign.status !== 'active' && campaign.status !== 'completed')) {
        return c.json({ code: 'not_found', message: 'Drive not found' }, 404);
    }
    const base = (process.env.BLACKOUT_PUBLIC_BASE_URL ?? 'https://theblackout.app').replace(
        /\/+$/,
        ''
    );
    // Cacheable: this is public, read-only and cheap to regenerate.
    c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    return c.json({
        drive: {
            id: campaign.id,
            coalitionId: view.value.coalition.id,
            coalitionName: view.value.coalition.name,
            coalitionSlug: view.value.coalition.slug,
            title: campaign.title,
            description: campaign.description,
            type: campaign.type,
            status: campaign.status,
            goalCents: campaign.goalCents ?? null,
            raisedCents: campaign.raisedCents,
            contributorCount: campaign.contributorCount,
            currency: 'USD',
            // The campaign deep link, not the coalition page: an embed showing
            // one drive should open that drive. `shareUrl` is the preview-backed
            // variant an embed host can post elsewhere and have unfurl.
            url: campaignAppUrl(view.value.coalition, campaign.id, base),
            shareUrl: campaignShareUrl(view.value.coalition, campaign.id, base),
        },
    });
});

// --- external sync: connections, opt-in, cross-posting, moderation ---

/** Map a sync-service error onto an HTTP response. */
function syncErrorResponse(c: Parameters<typeof requireUser>[0], error: SyncError): Response {
    switch (error.kind) {
        case 'not_found':
            return c.json({ code: 'not_found', message: 'Not found' }, 404);
        case 'not_member':
            return c.json(
                { code: 'not_member', message: 'You are not a member of this coalition' },
                403
            );
        case 'forbidden':
            return c.json(
                { code: 'forbidden', message: 'Your coalition role does not allow that' },
                403
            );
        case 'disabled':
            return c.json(
                {
                    code: 'sync_disabled',
                    message:
                        error.gate === 'inbound'
                            ? 'Two-way sync is not enabled on this server'
                            : 'Cross-posting is not enabled on this server',
                    gate: error.gate,
                },
                503
            );
        case 'no_connection':
            return c.json(
                {
                    code: 'no_connection',
                    message: `This coalition has not connected ${error.platform}`,
                    platform: error.platform,
                },
                409
            );
        case 'not_opted_in':
            return c.json(
                {
                    code: 'not_opted_in',
                    message: 'Turn on sync for this campaign before cross-posting',
                },
                409
            );
        case 'guardrail':
            return c.json(
                {
                    code: error.state.reason === 'cooldown' ? 'cooldown' : 'daily_cap',
                    message:
                        error.state.reason === 'cooldown'
                            ? 'You posted recently — give your followers a breather'
                            : `You have used today's ${error.state.cap} cross-posts for this coalition`,
                    retryAfterSeconds: error.state.retryAfterSeconds,
                    postsToday: error.state.postsToday,
                    cap: error.state.cap,
                },
                429
            );
        case 'campaign_inactive':
            return c.json(
                { code: 'campaign_inactive', message: 'Only active campaigns can be cross-posted' },
                409
            );
        case 'credentials_unavailable':
            return c.json(
                {
                    code: 'credentials_unavailable',
                    message: 'This server cannot store platform credentials yet',
                },
                503
            );
        case 'private_subject':
            // 404, not 403: a distinguishable "this exists but is private"
            // answer is an oracle for exactly the thing the member opted out
            // of. The campaign stays fully visible inside the coalition.
            return c.json({ code: 'not_found', message: 'Not found' }, 404);
    }
}

/** What this server can post to, and how. */

const connectSchema = z.object({
    platform: z.enum(COALITION_PLATFORMS),
    authMode: z.enum(CONNECTION_AUTH_MODES),
    secret: z.string().min(1).max(4096).optional(),
    displayHandle: z.string().max(120).optional(),
});

coalitions.post('/:id/connections', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, connectSchema);
    if (parsed instanceof Response) return parsed;
    const result = connectPlatform(c.req.param('id'), user.sub, parsed);
    if (!result.ok) return syncErrorResponse(c, result.error);
    return c.json({ connection: result.value }, 201);
});

const linkSchema = z.object({
    platform: z.enum(COALITION_PLATFORMS),
    secret: z.string().min(1).max(4096),
    displayHandle: z.string().max(120).optional(),
});

/** A member links their own account for a platform whose auth mode is personal. */
coalitions.post('/:id/connections/me', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, linkSchema);
    if (parsed instanceof Response) return parsed;
    const result = linkMemberAccount(
        c.req.param('id'),
        user.sub,
        parsed.platform,
        parsed.secret,
        parsed.displayHandle
    );
    if (!result.ok) return syncErrorResponse(c, result.error);
    return c.json({ connection: result.value }, 201);
});

/** The caller's own opt-ins for a campaign. An absent platform means off. */
coalitions.get('/:id/campaigns/:campaignId/sync', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const campaign = getCampaign(c.req.param('id'), c.req.param('campaignId'), user.sub);
    if (!campaign.ok) return errorResponse(c, campaign.error);
    return c.json({
        optIns: listOptIns(campaign.value.id, user.sub),
        guardrails: checkGuardrails(campaign.value.coalitionId, user.sub),
    });
});

const optInSchema = z.object({
    platform: z.enum(COALITION_PLATFORMS),
    enabled: z.boolean(),
});

coalitions.post('/:id/campaigns/:campaignId/sync', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, optInSchema);
    if (parsed instanceof Response) return parsed;
    const result = setOptIn(
        c.req.param('id'),
        user.sub,
        c.req.param('campaignId'),
        parsed.platform,
        parsed.enabled
    );
    if (!result.ok) return syncErrorResponse(c, result.error);
    return c.json({ optIn: result.value });
});

/** Cross-post to the platforms this member opted this campaign into. */
coalitions.post('/:id/campaigns/:campaignId/crosspost', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const result = await crosspostCampaign(c.req.param('id'), user.sub, c.req.param('campaignId'));
    if (!result.ok) return syncErrorResponse(c, result.error);
    return c.json(result.value);
});

/**
 * Share links for a campaign, on every target we can reach.
 *
 * `getAuthUser`, not `requireUser`: a logged-out visitor looking at a public
 * campaign is precisely the person we want passing it on, and making them sign
 * in first defeats the point. Signing in only widens what they can see (their
 * own coalition's draft campaigns), never narrows it.
 */
coalitions.get('/:id/campaigns/:campaignId/share', (c) => {
    const viewer = getAuthUser(c);
    const host = c.req.query('instanceHost');
    const result = shareCampaign(
        c.req.param('id'),
        c.req.param('campaignId'),
        viewer?.sub,
        host && isInstanceHost(host) ? host : undefined
    );
    if (!result.ok) return syncErrorResponse(c, result.error);
    // Same cache posture as the public campaign projection: short, revalidating,
    // and safe because the body carries no viewer-specific field.
    c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    return c.json(result.value);
});

/** The campaign's cross-post thread plus the approved external replies on it. */
coalitions.get('/:id/campaigns/:campaignId/thread', (c) => {
    const viewer = getAuthUser(c);
    const campaign = getCampaign(c.req.param('id'), c.req.param('campaignId'), viewer?.sub);
    if (!campaign.ok) return errorResponse(c, campaign.error);
    const insider = viewerIsMember(c);
    return c.json({
        // `authorUserId` is the member whose account carried the post out. The
        // post itself was an explicit opt-in, but the id is a raw handle that
        // joins back against the roster, so it stays behind the same line.
        posts: listCampaignPosts(campaign.value.id).map((post) =>
            insider ? post : { ...post, authorUserId: undefined }
        ),
        replies: listApprovedActivity(campaign.value.id),
    });
});

/** Moderation queue: inbound replies waiting on a decision. */
coalitions.get('/:id/externals/pending', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const result = listPendingActivity(c.req.param('id'), user.sub);
    if (!result.ok) return syncErrorResponse(c, result.error);
    return c.json({ pending: result.value });
});

for (const decision of ['approve', 'reject'] as const) {
    coalitions.post(`/:id/externals/:activityId/${decision}`, (c) => {
        const user = requireUser(c);
        if (user instanceof Response) return user;
        const result = moderateActivity(
            c.req.param('id'),
            user.sub,
            c.req.param('activityId'),
            decision
        );
        if (!result.ok) return syncErrorResponse(c, result.error);
        return c.json({ activity: result.value });
    });
}

export default coalitions;
