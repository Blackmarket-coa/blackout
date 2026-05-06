// Auth flow under load: register → login → /token/refresh.
// Designed to surface contention on the password hash, the rate limiter,
// and the refresh-token rotation path.
//
//   k6 run --env BASE_URL=http://localhost:3000 load/k6/auth.js

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  scenarios: {
    auth_flow: {
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
    // Excludes /password/reset/request — that path mails out and is async.
    'http_req_duration{path:auth}': ['p(95)<800'],
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ORIGIN = __ENV.ORIGIN || 'http://localhost:5173';

const headers = {
  'Content-Type': 'application/json',
  Origin: ORIGIN,
};

export default function () {
  const suffix = randomString(8);
  const username = `loaduser-${suffix}`;
  const email = `${username}@example.com`;
  const password = `Pa55-load-${suffix}-AbCxyz!`;

  let token = '';
  let refreshToken = '';

  group('register', () => {
    const res = http.post(
      `${BASE_URL}/v1/auth/register`,
      JSON.stringify({ username, email, password }),
      { headers, tags: { path: 'auth', op: 'register' } },
    );
    check(res, { 'register 2xx': (r) => r.status === 201 || r.status === 409 });
    if (res.status === 201) {
      token = res.json('token');
      refreshToken = res.json('refreshToken');
    }
  });

  if (!refreshToken) {
    group('login', () => {
      const res = http.post(
        `${BASE_URL}/v1/auth/login`,
        JSON.stringify({ email, password }),
        { headers, tags: { path: 'auth', op: 'login' } },
      );
      check(res, { 'login 200': (r) => r.status === 200 });
      if (res.status === 200) {
        token = res.json('token');
        refreshToken = res.json('refreshToken');
      }
    });
  }

  if (refreshToken) {
    group('refresh', () => {
      const res = http.post(
        `${BASE_URL}/v1/auth/token/refresh`,
        JSON.stringify({ refreshToken }),
        { headers, tags: { path: 'auth', op: 'refresh' } },
      );
      check(res, { 'refresh 200': (r) => r.status === 200 });
    });
  }

  sleep(1);
}
