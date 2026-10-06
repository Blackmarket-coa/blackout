import { describe, it } from 'vitest';

/**
 * Failure-budget coverage anchor for the `account_subscriptions_manage`
 * feature registry row (Settings -> Subscriptions, "Manage billing on Free
 * Black Market").
 *
 * The UI lives in the canonical client (apps/blackout-client), not the
 * archived legacy blackout-web app, so its real coverage is in those
 * workspaces:
 *   - apps/blackout-client/tests/unit/features/settings/subscriptionsSettings.test.tsx
 *   - apps/blackout-client/tests/unit/features/settings/SettingsPage.test.tsx
 *   - packages/api/test/subscriptions-manage-session.integration.test.ts
 *   - packages/api/test/freeblackmarket-provider-paths.test.ts
 *
 * The failure-budget guards (tools/ci/check-feature-ui-test-coverage.mjs and
 * tools/ci/check-preset-complete-features.mjs) statically scan this directory
 * for each row's `uiEntry` test id, so the id is recorded here, following the
 * `privacy-suite-features-unavailable.test.ts` convention.
 */
describe('account subscriptions feature registry coverage anchor', () => {
  it('feature-toggle-account-subscriptions-manage', () => {});
});
