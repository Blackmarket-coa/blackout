/**
 * What the API's HTTP server does when it is told to stop (src/httpShutdown.ts).
 *
 * The store is drained once `closeWhenSettled` resolves, so everything here is
 * about that promise: it must resolve once no request is in flight, whatever
 * connections clients hold open, and after it no request can still be
 * answered. Until 2026-11-16 the shutdown waited for `server.close()` to call
 * back, which a busy keep-alive client, a connection that had sent nothing, an
 * event stream or a WebSocket held off until the hard timeout ended the
 * process with the store undrained.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createHttpShutdown, SHUTTING_DOWN_BODY } from '../src/httpShutdown';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const startServer = async () => {
    const shutdown = createHttpShutdown();
    const app = new Hono();
    app.use('*', shutdown.middleware);
    app.get('/slow', async (c) => {
        await sleep(Number(c.req.query('ms') ?? '200'));
        return c.json({ ok: true }, 201);
    });
    app.get('/fast', (c) => c.json({ ok: true }));
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }) as http.Server;
    await new Promise<void>((resolve) => {
        if (server.listening) resolve();
        else server.once('listening', () => resolve());
    });
    shutdown.attach(server);
    const closed = new Promise<number>((resolve) =>
        server.once('close', () => resolve(Date.now()))
    );
    const { port } = server.address() as AddressInfo;
    return { shutdown, server, port, closed };
};

type Answer = { status: number; connection: string | undefined; body: string };

const get = (port: number, path: string, agent?: http.Agent): Promise<Answer> =>
    new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path, agent }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () =>
                resolve({ status: res.statusCode ?? 0, connection: res.headers.connection, body })
            );
        });
        req.on('error', reject);
    });

const socketClosed = (socket: net.Socket): Promise<void> =>
    new Promise((resolve) => {
        if (socket.destroyed) resolve();
        else socket.once('close', () => resolve());
    });

test('a request in flight at the signal is answered, saying Connection: close', async () => {
    const { shutdown, port, closed } = await startServer();
    const agent = new http.Agent({ keepAlive: true });
    const inFlight = get(port, '/slow?ms=300', agent);
    await sleep(50);

    const started = Date.now();
    const result = await shutdown.closeWhenSettled(5_000);
    const answer = await inFlight;

    assert.deepEqual(result, { settled: true, inFlight: 0 });
    assert.equal(answer.status, 201);
    assert.equal(answer.connection, 'close');
    assert.ok((await closed) - started < 1_000, 'the server closed with the request');
    agent.destroy();
});

test('a request that arrives after the signal is answered 503, saying Connection: close', async () => {
    const { shutdown, port } = await startServer();
    const agent = new http.Agent({ keepAlive: true });
    // A connection the client already holds, so the request reaches the server
    // although it no longer listens.
    await get(port, '/fast', agent);
    const slow = get(port, '/slow?ms=400', agent);
    const socket = new net.Socket();
    await new Promise<void>((resolve) => socket.connect(port, '127.0.0.1', () => resolve()));
    await sleep(30);

    shutdown.begin();
    let response = '';
    socket.on('data', (chunk) => (response += chunk.toString('utf8')));
    socket.write('GET /fast HTTP/1.1\r\nHost: x\r\n\r\n');
    await socketClosed(socket);

    assert.match(response, /^HTTP\/1\.1 503 /);
    assert.match(response, /\r\nconnection: close\r\n/i);
    assert.match(response, /\r\nretry-after: 1\r\n/i);
    assert.ok(response.includes(JSON.stringify(SHUTTING_DOWN_BODY)));
    assert.equal((await slow).status, 201, 'the request already in flight is still answered');
    await shutdown.closeWhenSettled(5_000);
    agent.destroy();
});

test('a keep-alive client sending one request after another does not hold the shutdown', async () => {
    const { shutdown, port, closed } = await startServer();
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    let stop = false;
    const statuses: number[] = [];
    const client = (async () => {
        while (!stop) {
            try {
                statuses.push((await get(port, '/slow?ms=20', agent)).status);
            } catch {
                break; // the server no longer listens
            }
        }
    })();
    await sleep(200);

    const started = Date.now();
    const result = await shutdown.closeWhenSettled(5_000);
    assert.equal(result.settled, true);
    assert.ok((await closed) - started < 1_000, 'closed within a request or two, not at a timeout');
    stop = true;
    await client;
    assert.ok(statuses.filter((s) => s === 201).length > 3, 'it was answered before the signal');
    agent.destroy();
});

test('a connection that has sent nothing does not hold the shutdown, and is closed', async () => {
    const { shutdown, port, closed } = await startServer();
    const socket = net.connect(port, '127.0.0.1');
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    await sleep(30);

    const started = Date.now();
    const result = await shutdown.closeWhenSettled(5_000);
    assert.deepEqual(result, { settled: true, inFlight: 0 });
    await socketClosed(socket);
    assert.ok((await closed) - started < 1_000);
});

test('an upgraded connection (a WebSocket) is closed', async () => {
    const { shutdown, server, port, closed } = await startServer();
    server.on('upgrade', (_req, socket) => {
        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\nUpgrade: test\r\nConnection: Upgrade\r\n\r\n'
        );
    });
    const socket = net.connect(port, '127.0.0.1');
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    let handshake = '';
    socket.on('data', (chunk) => (handshake += chunk.toString('utf8')));
    socket.write('GET /ws HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n');
    while (!handshake.includes('101')) await sleep(10);

    const started = Date.now();
    await shutdown.closeWhenSettled(5_000);
    await socketClosed(socket);
    assert.ok((await closed) - started < 1_000);
});

test('a request that outlasts the grace loses its connection, and the shutdown goes on', async () => {
    const { shutdown, port, closed } = await startServer();
    const pending = get(port, '/slow?ms=10000').then(
        () => 'answered',
        () => 'connection lost'
    );
    await sleep(50);

    const started = Date.now();
    const result = await shutdown.closeWhenSettled(300);
    assert.deepEqual(result, { settled: false, inFlight: 1 });
    assert.equal(await pending, 'connection lost', 'never answered');
    assert.ok((await closed) - started < 1_000);
});
