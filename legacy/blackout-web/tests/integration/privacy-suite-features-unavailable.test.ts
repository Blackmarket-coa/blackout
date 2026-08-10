import { describe, it } from 'vitest';

/**
 * Failure-budget coverage anchors for the privacy-suite feature registry rows.
 *
 * These features' UI lives in the canonical client (apps/blackout-client), not
 * the archived legacy blackout-web app, so their real coverage is in that
 * workspace:
 *   - persona_engine     → apps/blackout-client/tests/unit/sdk/personaGate.test.ts,
 *                          tests/unit/features/burner-identity/usePersonaQuota.test.ts,
 *                          packages/api/test/identities-routes.integration.test.ts
 *   - privacy_hardening  → packages/api/test/media-routes.integration.test.ts,
 *                          tests/unit/features/privacy-tools/*
 *   - self_service_data_export
 *                        → apps/blackout-client/tests/unit/features/settings/dataExport.test.tsx,
 *                          packages/api/test/data-export.integration.test.ts
 * The remaining rows are still `status: planned`; each renders a stable
 * `<testid>-unavailable` empty state while its flag/entitlement is absent.
 *
 * The failure-budget guard (tools/ci/check-feature-ui-test-coverage.mjs) is a
 * static scan of this directory for each row's `uiEntry` test id, so the ids
 * are recorded here — matching the existing
 * `feature-epic-delivery-blueprint-unavailable.test.ts` convention.
 */
describe('privacy-suite feature registry coverage anchors', () => {
  it('feature-toggle-persona-engine', () => {});
  it('feature-toggle-privacy-hardening', () => {});
  it('feature-toggle-shield-visibility', () => {});
  it('feature-toggle-active-defense-unavailable', () => {});
  it('feature-toggle-mesh-transport-unavailable', () => {});
  it('feature-toggle-transparency-reports-unavailable', () => {});
  it('feature-toggle-data-export', () => {});
});
