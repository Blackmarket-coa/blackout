import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';

const capabilities = new Hono();

capabilities.get('/', (c) => {
    const user = requireUser(c, 'Sign in to view capabilities');
    if (user instanceof Response) return user;

    return c.json({ subject: user.sub, capabilities: user.capabilities ?? [] });
});

export default capabilities;
