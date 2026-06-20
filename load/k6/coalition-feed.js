// Coalition feed engagement under load: read the public video feed, then
// toggle likes and post/read comments on a feed item. Exercises the
// like/comment write-through (idempotent upsert on (feed_item_id, user_id))
// and the public read paths added for the video reel.
//
//   k6 run --env BASE_URL=http://localhost:3000 load/k6/coalition-feed.js
//
// The script discovers a feed item id from the public feed at startup so it
// works regardless of seed data; if the feed is empty it exercises only the
// public read paths and skips the authenticated writes.

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  scenarios: {
    feed_engagement: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '2m', target: 25 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    'http_req_duration{path:coalition_feed}': ['p(95)<800'],
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ORIGIN = __ENV.ORIGIN || 'http://localhost:5173';

const jsonHeaders = {
  'Content-Type': 'application/json',
  Origin: ORIGIN,
};

// Discover a video feed item id once, shared across all VUs.
export function setup() {
  const res = http.get(`${BASE_URL}/v1/coalition/feed?kind=video&limit=1`, {
    headers: { Origin: ORIGIN },
    tags: { path: 'coalition_feed', op: 'feed_list' },
  });
  let feedItemId = null;
  if (res.status === 200) {
    const items = res.json('items');
    if (Array.isArray(items) && items.length > 0) feedItemId = items[0].id;
  }
  return { feedItemId };
}

function authToken() {
  const suffix = randomString(8);
  const username = `loadfeed-${suffix}`;
  const body = JSON.stringify({
    username,
    email: `${username}@example.com`,
    password: `Pa55-feed-${suffix}-AbCxyz!`,
  });
  const res = http.post(`${BASE_URL}/v1/auth/register`, body, {
    headers: jsonHeaders,
    tags: { path: 'coalition_feed', op: 'register' },
  });
  return res.status === 201 ? res.json('token') : '';
}

export default function (data) {
  const feedItemId = data.feedItemId;

  group('public feed read', () => {
    const res = http.get(`${BASE_URL}/v1/coalition/feed?kind=video&limit=20`, {
      headers: { Origin: ORIGIN },
      tags: { path: 'coalition_feed', op: 'feed_list' },
    });
    check(res, { 'feed 200': (r) => r.status === 200 });
  });

  if (!feedItemId) {
    sleep(1);
    return;
  }

  const likesPath = `${BASE_URL}/v1/coalition/feed/${encodeURIComponent(feedItemId)}/likes`;
  const commentsPath = `${BASE_URL}/v1/coalition/feed/${encodeURIComponent(feedItemId)}/comments`;

  group('public engagement read', () => {
    const likes = http.get(likesPath, {
      headers: { Origin: ORIGIN },
      tags: { path: 'coalition_feed', op: 'likes_read' },
    });
    check(likes, { 'likes 200': (r) => r.status === 200 });

    const comments = http.get(commentsPath, {
      headers: { Origin: ORIGIN },
      tags: { path: 'coalition_feed', op: 'comments_read' },
    });
    check(comments, { 'comments 200': (r) => r.status === 200 });
  });

  const token = authToken();
  if (!token) {
    sleep(1);
    return;
  }
  const authHeaders = { ...jsonHeaders, Authorization: `Bearer ${token}` };

  group('like toggle', () => {
    const on = http.post(likesPath, JSON.stringify({ active: true }), {
      headers: authHeaders,
      tags: { path: 'coalition_feed', op: 'like_set' },
    });
    check(on, { 'like 200': (r) => r.status === 200, 'liked count >= 1': (r) => r.json('count') >= 1 });

    // Re-like is idempotent on (feed_item_id, user_id) — should not duplicate.
    const again = http.post(likesPath, JSON.stringify({ active: true }), {
      headers: authHeaders,
      tags: { path: 'coalition_feed', op: 'like_set' },
    });
    check(again, { 'relike 200': (r) => r.status === 200 });
  });

  group('comment post', () => {
    const res = http.post(commentsPath, JSON.stringify({ body: `load comment ${randomString(12)}` }), {
      headers: authHeaders,
      tags: { path: 'coalition_feed', op: 'comment_post' },
    });
    check(res, { 'comment 201': (r) => r.status === 201 });
  });

  sleep(1);
}
