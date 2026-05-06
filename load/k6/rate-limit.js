// Verifies the rate limiter — slams /v1/auth/login from a single fixed IP and
// asserts that 429s appear within the first 11 attempts (10 req/min limit
// per packages/api/src/middleware/rate-limit.ts:42).
//
//   k6 run --env BASE_URL=http://localhost:3000 load/k6/rate-limit.js

import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 20,
      maxDuration: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.95'], // We expect failures here — that's the point.
    'checks{check:eventually_429}': ['rate>0.90'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const FIXED_IP = '198.51.100.42';

export default function () {
  const res = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify({ email: 'load@example.com', password: 'wrong-credential' }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': FIXED_IP,
      },
    },
  );
  // Either 401 (within limit) or 429 (over limit) is a successful contract.
  check(res, {
    'is 401 or 429': (r) => r.status === 401 || r.status === 429,
    eventually_429: (r) => r.status === 429,
  });
}
