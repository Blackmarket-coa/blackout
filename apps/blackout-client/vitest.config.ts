// Vitest configuration for @blackout/client.
//
// The `exclude` list below quarantines pre-existing broken test files that
// surfaced when CI was repointed from `@blackout/blackout-web` (legacy shell
// archived 2026-05-01) to `@blackout/client`. Each entry must have a
// matching row in
// `docs/architecture/deferred-bodies-schedule-2026-05-01.md`
// under "Test debt — quarantined unit tests" so the cleanup is tracked.
//
// Do NOT add new entries here without also updating that doc.

import { defineConfig } from 'vitest/config';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

export default defineConfig({
    // Vitest needs the vanilla-extract plugin to transform `.css.ts` files.
    // The runtime build picks it up via vite.config.js (legacy Cinny shell);
    // tests previously crashed on any module that transitively imported a
    // `.css.ts` ("Styles were unable to be assigned to a file").
    plugins: [vanillaExtractPlugin()],
    test: {
        // Production-readiness audit, May 2026: enforce per-PR coverage so
        // new client code lands with tests. Thresholds are no-regression
        // floors keyed to the current actual coverage (~19.6 lines/stmts,
        // ~60.1 branches, ~26.1 functions) with a small margin; ratchet up
        // as the remaining feature-blocked quarantined tests
        // (DraupnirNavigation, ClientLayout, RoomView.layout) come back
        // online under Workstream A Port 1.
        //
        // The previous thresholds (60/55/60/60) were aspirational only — they
        // were never enforced because @vitest/coverage-v8 was not installed
        // and CI did not pass --coverage. Both gaps are now closed:
        // - @vitest/coverage-v8 declared in devDependencies
        // - .github/workflows/ci.yml unit-tests job runs `test:coverage`
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/**/*.{test,spec}.{ts,tsx}',
                'src/**/__tests__/**',
                'src/**/*.css.ts',
                'src/**/types.ts',
            ],
            thresholds: {
                lines: 18,
                functions: 25,
                branches: 58,
                statements: 18,
            },
            reporter: ['text', 'lcov'],
        },
        exclude: [
            // Default vitest excludes:
            '**/node_modules/**',
            '**/dist/**',
            '**/.{idea,git,cache,output,temp}/**',
            // Quarantined pre-existing broken files (see deferred-bodies-schedule):
            // ClientLayout / DraupnirNavigation / RoomView.layout assert against a
            // shell + adapter surface still being landed under Workstream A Port 1
            // (current mocks predate `useLegacyRoomAdapter` + `useCoalitionState`).
            'tests/unit/features/moderation/draupnir/DraupnirNavigation.test.tsx',
            'tests/unit/pages/client/ClientLayout.test.tsx',
            'tests/unit/features/room/RoomView.layout.test.tsx',
        ],
    },
});
