// Verifies the rate limiter — slams /v1/auth/login from a single fixed IP and
// asserts that 429s appear within the first 11 attempts (10 req/min limit,
// `authRateLimit` in packages/api/src/middleware/rate-limit.ts).
//
//   k6 run --env BASE_URL=http://localhost:3000 load/k6/rate-limit.js
//
// Pass AUTH_RATE_LIMIT_MAX if the target overrides the API's default budget.

import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

// The auth bucket's per-address budget, parsed the way the API parses it.
const parsedLimit = Number.parseInt(__ENV.AUTH_RATE_LIMIT_MAX ?? '', 10);
const LIMIT = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;

// 401 (wrong credential, inside the budget) and 429 (over it) are both the
// contract, so neither counts as a failed request. Anything else — a 5xx, a
// validation or CORS 4xx, a refused connection — does, and fails the run.
// (Without this every response counted as failed, so `http_req_failed` sat at
// 100% on a perfectly behaving API and crossed its old `rate<0.95` bound.)
http.setResponseCallback(http.expectedStatuses(401, 429));

export const options = {
    scenarios: {
        burst: {
            executor: 'shared-iterations',
            vus: 1,
            iterations: LIMIT * 2,
            maxDuration: '15s',
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],
        'checks{check:eventually_429}': ['rate>0.90'],
        // k6 passes a threshold that has no samples, and eventually_429 is only
        // sampled past the budget, so a burst cut short by maxDuration would
        // pass it vacuously. Require every attempt to have completed.
        iterations: [`count>=${LIMIT * 2}`],
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
        }
    );
    // Either 401 (within limit) or 429 (over limit) is a successful contract.
    check(res, { 'is 401 or 429': (r) => r.status === 401 || r.status === 429 });
    // Scored only once the budget is spent, where 429 is the only right answer.
    // Inside it 401 is right (429 is tolerated: a re-run within the 60 s window
    // starts on a part-spent bucket). Scoring every attempt, as this used to,
    // capped a correct limiter at LIMIT / (2 * LIMIT) = 50% against `rate>0.90`.
    if (exec.scenario.iterationInTest >= LIMIT) {
        check(res, { eventually_429: (r) => r.status === 429 });
    }
}
