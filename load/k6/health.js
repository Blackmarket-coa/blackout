// Steady-state load against /health to sanity-check the API floor latency
// and saturate the metrics middleware. Run with:
//   k6 run --env BASE_URL=http://localhost:3000 load/k6/health.js

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 50 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<150', 'p(99)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body is ok': (r) => (r.json('status') ?? '') === 'ok',
  });
  sleep(0.1);
}
