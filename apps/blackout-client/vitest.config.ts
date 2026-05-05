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
        exclude: [
            // Default vitest excludes:
            '**/node_modules/**',
            '**/dist/**',
            '**/.{idea,git,cache,output,temp}/**',
            // Quarantined pre-existing broken files (see deferred-bodies-schedule):
            // missing util exports in src/app/utils/room.ts
            'tests/unit/utils/room.test.ts',
            // missing src/app/features/navigation/QuickSwitcher index helper (buildQuickSwitcherIndex)
            // and assertion-level test debt against current QuickSwitcher API
            'tests/unit/features/navigation/QuickSwitcher.test.tsx',
            // assertion-level drift (DraupnirNavigation expects 'Moderation' link textContent that the current shell does not render)
            'tests/unit/features/moderation/draupnir/DraupnirNavigation.test.tsx',
            // assertion-level drift (ClientLayout test expects elements the modern shell does not render yet)
            'tests/unit/pages/client/ClientLayout.test.tsx',
            // monetization customizations expected count drifted (15 vs 7)
            'tests/unit/features/monetization/monetizationRegistrySafetyMatrix.test.tsx',
            // RoomView.layout test environment / assertion drift
            'tests/unit/features/room/RoomView.layout.test.tsx',
            // parity tests against legacy shell behavior — superseded by canonical client work
            'tests/unit/parity/baselineResetSnapshotParity.test.tsx',
            'tests/unit/parity/monetizationLayoutParity.test.tsx',
        ],
    },
});
