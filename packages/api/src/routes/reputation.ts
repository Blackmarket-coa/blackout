import { Hono } from 'hono';
import { getUserReputation } from '../services/reputationStore';

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
    });
});

export default reputation;
