import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import messageRoutes from './routes/messages';
import governanceRoutes from './routes/governance';
import federationRoutes from './routes/federation';
import channelRoutes from './routes/channels';

const app = new Hono();

app.use('*', cors());

app.route('/api/auth', authRoutes);
app.route('/api/messages', messageRoutes);
app.route('/api/governance', governanceRoutes);
app.route('/api/federation', federationRoutes);
app.route('/api/channels', channelRoutes);

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
