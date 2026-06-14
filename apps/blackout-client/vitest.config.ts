// Vitest configuration for @blackout/client.
//
// As of 2026-05-13 the file-level quarantine that surfaced when CI was
// repointed from `@blackout/blackout-web` (archived 2026-05-01) to
// `@blackout/client` is empty. Three previously-quarantined files
// (DraupnirNavigation, RoomView.layout, ClientLayout) were brought back
// online by refreshing their mocks against the current matrix-client
// surface, and the seven scenario-specific `it.skip(...)` cases inside
// ClientLayout.test.tsx were subsequently cleared via stable testids
// (`right-panel`, `mobile-den-organization`, `quick-switcher-input`),
// updated placeholder selectors, and refreshed "den" terminology
// assertions. ClientLayout.test.tsx now runs 17 passed / 0 skipped. The
// full history of this work is tracked in
// `docs/architecture/deferred-bodies-schedule-2026-05-01.md`.
//
// Coverage thresholds are no-regression floors keyed to current actual
// coverage with a small margin. Bump them in lock-step every time a
// `it.skip` is un-skipped or new src/ code lands with tests.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    // Vitest needs the vanilla-extract plugin to transform `.css.ts` files.
    // The runtime build picks it up via vite.config.js (legacy Cinny shell);
    // tests previously crashed on any module that transitively imported a
    // `.css.ts` ("Styles were unable to be assigned to a file").
    plugins: [vanillaExtractPlugin()],
    // Dedupe React so primitives consumed from `@blackout/ui` source (which
    // declares its own react ^19 for the RN components) share the app's single
    // react 18 instance instead of pulling a second copy — otherwise elements
    // created by one React are "not valid as a React child" for the other.
    resolve: {
        dedupe: ['react', 'react-dom'],
        alias: {
            // `@blackout/ui` primitives import `@blackout/design` by package
            // name; resolve it to source so tests don't depend on its dist.
            '@blackout/design': path.resolve(rootDir, '../../packages/design/src/index.ts'),
        },
    },
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
                // Re-baselined for vitest 4: coverage-v8 4.x switched to
                // AST-aware remapping (ast-v8-to-istanbul), which counts
                // branches/functions far more granularly than vitest 2 did. The
                // same tests now measure (1480 tests, 260 files):
                //   statements ~28.4, lines ~29.3, branches ~19.5, functions ~19.4
                // (statements/lines rose; branches/functions fell purely from
                // the new methodology, not a coverage regression). Floors set
                // ~1pp below current to absorb measurement noise.
                lines: 28,
                functions: 18,
                branches: 18,
                statements: 27,
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
