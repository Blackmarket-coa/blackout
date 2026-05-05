import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import { listRolesForUser, userHasRole, userHasRoleInCommunity } from '../services/roles';

const roles = new Hono();

roles.get('/me', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({ roles: listRolesForUser(user.sub) });
});

roles.get('/me/has/:roleId', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const roleId = c.req.param('roleId');
    const communityId = c.req.query('communityId');
    const has = communityId
        ? userHasRoleInCommunity(user.sub, roleId, communityId)
        : userHasRole(user.sub, roleId);
    return c.json({ roleId, communityId: communityId ?? null, hasRole: has });
});

export default roles;
