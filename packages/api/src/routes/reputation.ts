import { Hono } from 'hono';
import { getUserArenaRecord, getUserReputation } from '../services/reputationStore';
import { listBriefs } from '../services/coliseumMatchStore';

const reputation = new Hono();

reputation.get('/:userId', (c) => {
    const userId = c.req.param('userId');
    if (!userId) {
        return c.json({ code: 'invalid_request', message: 'userId is required' }, 400);
    }
    const profile = getUserReputation(userId);
    return c.json({
        userId,
        generatedAt: new Date().toISOString(),
        reputation: profile,
        // The literal arena track record: event counts plus the permanent
        // Briefs this user fought in — the profile's visible status layer.
        record: {
            ...getUserArenaRecord(userId),
            briefsAuthored: listBriefs({ fighterId: userId }).length,
        },
    });
});

export default reputation;
