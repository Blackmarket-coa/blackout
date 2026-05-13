// Vitest configuration for @blackout/client.
//
// As of 2026-05-13 the file-level quarantine that surfaced when CI was
// repointed from `@blackout/blackout-web` (archived 2026-05-01) to
// `@blackout/client` is empty. Three previously-quarantined files
// (DraupnirNavigation, RoomView.layout, ClientLayout) were brought back
// online by refreshing their mocks against the current matrix-client
// surface; seven scenario-specific cases inside ClientLayout.test.tsx
// remain `it.skip(...)` with explanatory comments, tracked in
// `docs/architecture/deferred-bodies-schedule-2026-05-01.md`.
//
// Coverage thresholds are no-regression floors keyed to current actual
// coverage with a small margin. Bump them in lock-step every time a
// `it.skip` is un-skipped or new src/ code lands with tests.

import { defineConfig } from 'vitest/config';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

export default defineConfig({
    // Vitest needs the vanilla-extract plugin to transform `.css.ts` files.
    // The runtime build picks it up via vite.config.js (legacy Cinny shell);
    // tests previously crashed on any module that transitively imported a
    // `.css.ts` ("Styles were unable to be assigned to a file").
    plugins: [vanillaExtractPlugin()],
    test: {
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
                // Current actual coverage (843 tests, 147 files):
                //   statements/lines ~23.78, branches ~63.80, functions ~27.47
                // Floors set ~1pp below current to absorb measurement noise.
                lines: 23,
                functions: 27,
                branches: 62,
                statements: 23,
            },
            reporter: ['text', 'lcov'],
        },
        exclude: [
            // Default vitest excludes:
            '**/node_modules/**',
            '**/dist/**',
            '**/.{idea,git,cache,output,temp}/**',
        ],
    },
});
