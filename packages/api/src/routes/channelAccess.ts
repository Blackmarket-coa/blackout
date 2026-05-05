import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import {
    listChannelAccessForUser,
    userHasChannelAccess,
} from '../services/channelAccess';

const channelAccess = new Hono();

channelAccess.get('/me', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({ access: listChannelAccessForUser(user.sub) });
});

channelAccess.get('/:channelId', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const channelId = c.req.param('channelId');
    return c.json({ channelId, canAccess: userHasChannelAccess(user.sub, channelId) });
});

export default channelAccess;
