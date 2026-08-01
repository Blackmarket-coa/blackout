import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import { getEntitlementsClient } from '../integrations/fbm/entitlementsClientFactory';

/**
 * Coalition Credits earnings panel data (Creator Hub → Earnings → Coalition
 * Credits). Projects the FBM Entitlements Service economic-standing slice into
 * the narrow envelope the dashboard needs.
 *
 * The FBM entitlements service is optional infrastructure: when it isn't
 * configured (`getEntitlementsClient()` returns undefined) — or a live call
 * fails — this route degrades to `{ available: false }` rather than erroring,
 * mirroring the creator-insights route. The client hides the panel on
 * `available: false` instead of rendering a misleading zero balance.
 */
const coalitionCredits = new Hono();

// Same identity bridge the profile/follows surfaces use: a Blackout username is
// the MXID localpart on the configured homeserver. Inlined (not shared) because
// `matrixUserIdFor` lives as a private helper in the routes that need it.
const matrixUserIdFor = (username: string): string => {
    const domain = (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');
    return `@${username}:${domain}`;
};

/** Coalition Credits currency code (per the FBM entitlements contract). */
const COALITION_CREDITS_CURRENCY = 'CC';

coalitionCredits.get('/', async (c) => {
    const user = requireUser(c, 'Sign in to view coalition credits');
    if (user instanceof Response) return user;

    const client = getEntitlementsClient();
    if (!client) {
        // Entitlements service not configured on this deployment.
        return c.json({ available: false });
    }

    try {
        const summary = await client.getSummary(matrixUserIdFor(user.username));
        const standing = summary.economicStanding;
        return c.json({
            available: true,
            balanceMinorUnits: standing.coalitionCreditsBalanceMinorUnits,
            currency: COALITION_CREDITS_CURRENCY,
            pendingPayouts: standing.pendingPayouts.map((payout) => ({
                currency: payout.currency,
                amountMinorUnits: payout.amountMinorUnits,
                expectedSettlementAt: payout.expectedSettlementAt,
            })),
            rewardEligibility: standing.creatorRewardEligibility.map((program) => ({
                programKey: program.program,
                eligible: program.eligible,
            })),
        });
    } catch {
        // Never 500 the dashboard on an entitlements hiccup — degrade to hidden.
        return c.json({ available: false });
    }
});

export default coalitionCredits;
