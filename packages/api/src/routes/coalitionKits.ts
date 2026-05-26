import { Hono } from 'hono';
import { parseCoalitionKitManifest } from '@blackout/core';
import { requireUser } from '../middleware/require-user';
import { db } from '../db/store';
import {
    authorizeGovernance,
    authorizeScope,
} from '../services/pluginInstallations';
import {
    applyCoalitionKit,
    coalitionKitsEnabled,
    listCoalitionKitApplications,
} from '../services/coalitionKits';

const coalitionKits = new Hono();

coalitionKits.use('*', async (c, next) => {
    if (!coalitionKitsEnabled()) {
        return c.json({ code: 'feature_disabled', message: 'Coalition kits are not enabled.' }, 404);
    }
    await next();
});

coalitionKits.get('/:coalitionId', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({ applications: listCoalitionKitApplications(c.req.param('coalitionId')) });
});

coalitionKits.post('/:coalitionId/apply', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const coalitionId = c.req.param('coalitionId');

    const scope = { type: 'coalition', id: coalitionId } as const;
    const reputationTier = db.getUserById(user.sub)?.reputationTier ?? 'member';
    const scopeAuth = authorizeScope(user.sub, reputationTier, scope);
    if (!scopeAuth.ok) {
        return c.json({ code: scopeAuth.code, message: scopeAuth.message }, 403);
    }

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
        return c.json({ code: 'invalid_body', message: 'JSON body required.' }, 400);
    }

    // A paid kit must be authorized by a passed governance proposal (Phase 3).
    const isPaid = body.isPaid === true;
    const governanceProposalId =
        typeof body.governanceProposalId === 'string' ? body.governanceProposalId : null;
    const govAuth = authorizeGovernance(scope, isPaid, governanceProposalId);
    if (!govAuth.ok) {
        return c.json({ code: govAuth.code, message: govAuth.message }, 403);
    }

    let manifest;
    try {
        manifest = parseCoalitionKitManifest(body.manifest);
    } catch (error) {
        return c.json({ code: 'invalid_manifest', message: (error as Error).message }, 400);
    }

    const result = await applyCoalitionKit({
        coalitionId,
        manifest,
        appliedByUserId: user.sub,
    });
    return c.json(result, result.denFailures.length > 0 ? 207 : 201);
});

export default coalitionKits;
