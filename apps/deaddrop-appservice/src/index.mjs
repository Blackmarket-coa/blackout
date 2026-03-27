import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);

/** @type {Map<string, { config: any, queue: Array<any> }>} */
const roomState = new Map();

const getRoomBucket = (roomId) => {
  const existing = roomState.get(roomId);
  if (existing) return existing;
  const created = {
    config: {
      enabled: false,
      schedule: { type: 'interval', intervalMinutes: 60 },
      anonymize: false,
      maxQueueSize: 100,
      retentionHours: 48,
    },
    queue: [],
  };
  roomState.set(roomId, created);
  return created;
};

const sendJson = (res, code, payload) => {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
};

const flushRoom = async (roomId) => {
  const bucket = getRoomBucket(roomId);
  if (!bucket.config.enabled || bucket.queue.length === 0) return { delivered: 0 };

  const toDeliver = bucket.queue.splice(0, bucket.queue.length);

  for (const queued of toDeliver) {
    const sender = bucket.config.anonymize ? process.env.DEAD_DROP_BOT_USER_ID ?? '@deaddrop-bot:example.org' : queued.sender;

    // Replace this with Matrix client sendEvent call in production.
    console.log('[dead-drop] delivering', {
      roomId,
      sender,
      body: queued.content?.body,
      queuedAt: queued.queuedAt,
    });
  }

  return { delivered: toDeliver.length };
};

const runSchedulerTick = async () => {
  const now = Date.now();
  for (const [roomId, bucket] of roomState.entries()) {
    if (!bucket.config.enabled) continue;

    if (bucket.config.schedule.type === 'manual') continue;

    if (bucket.config.schedule.type === 'interval') {
      const intervalMinutes = Math.max(1, Number(bucket.config.schedule.intervalMinutes || 60));
      const intervalMs = intervalMinutes * 60_000;
      const due = bucket.lastFlushAt ? now - bucket.lastFlushAt >= intervalMs : true;
      if (due) {
        await flushRoom(roomId);
        bucket.lastFlushAt = now;
      }
      continue;
    }

    if (bucket.config.schedule.type === 'cron') {
      // Minimal fallback scheduler for "hourly" behavior.
      const currentMinute = new Date(now).getMinutes();
      if (currentMinute === 0 && bucket.lastCronMinute !== 0) {
        await flushRoom(roomId);
      }
      bucket.lastCronMinute = currentMinute;
    }
  }
};

setInterval(() => {
  void runSchedulerTick();
}, 1_000);

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(res, 400, { error: 'bad request' });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, rooms: roomState.size });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      const roomId = payload.roomId;
      if (typeof roomId !== 'string' || roomId.length === 0) {
        sendJson(res, 400, { error: 'roomId is required' });
        return;
      }

      const bucket = getRoomBucket(roomId);

      if (url.pathname === '/configure') {
        bucket.config = {
          ...bucket.config,
          ...payload.config,
        };
        sendJson(res, 200, { ok: true, config: bucket.config });
        return;
      }

      if (url.pathname === '/ingest') {
        if (!bucket.config.enabled) {
          sendJson(res, 200, { queued: false, reason: 'dead drop disabled' });
          return;
        }

        if (bucket.queue.length >= bucket.config.maxQueueSize) {
          sendJson(res, 429, { error: 'max queue size reached' });
          return;
        }

        bucket.queue.push({
          sender: payload.sender,
          content: payload.content,
          queuedAt: Date.now(),
          condition: payload.condition || null,
        });

        sendJson(res, 200, { queued: true, queueCount: bucket.queue.length });
        return;
      }

      if (url.pathname === '/flush') {
        const result = await flushRoom(roomId);
        sendJson(res, 200, { ok: true, ...result, queueCount: bucket.queue.length });
        return;
      }

      if (url.pathname === '/clear') {
        bucket.queue.splice(0, bucket.queue.length);
        sendJson(res, 200, { ok: true, queueCount: 0 });
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'unknown error' });
    }
  });
});

server.listen(PORT, () => {
  console.log(`[dead-drop-appservice] listening on :${PORT}`);
});
