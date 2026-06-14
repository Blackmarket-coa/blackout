# @blackout/ui

React component library for Blackout.

## Boutique components (React Native)

The original package surface — RN-first components used by the mobile/native
shells: `CanopyBar`, `OverflowSheet`, `RadialBloom`, `VineActions`. Imported
from the package root (`@blackout/ui`).

## Primitives v1 (web · Workstream B1)

`@blackout/ui/primitives` — typed, themeable web primitives styled with
[vanilla-extract](https://vanilla-extract.style/). Every primitive consumes
`@blackout/design` tokens, and colors resolve to the live theme's CSS custom
properties (the contract lives in
`apps/blackout-client/src/app/styles/theme.css.ts`), so primitives re-theme
automatically when the active theme class changes.

| Primitive | Props (key) | Design tokens used |
| --- | --- | --- |
| `Button` | `tone` (primary/neutral/danger), `size` (sm/md), `loading` | `designColors.accent*/bg*/border*/danger`, `designRadii.mdPx`, `designSpacing.denseGapPx`, `designTypography` |
| `IconButton` | `size`, `active` (→ `aria-pressed`) | `designColors.bgInput/textPrimary/accentMuted/border*`, `designRadii.smPx` |
| `Input` | `invalid` (→ `aria-invalid`) | `designColors.bgInput/textPrimary/border*/danger`, `designRadii.mdPx`, `designTypography` |
| `Badge` | `tone`, `onDismiss`, `dismissLabel` | `designColors.border*/text*/accentPrimary/danger`, `designRadii.pillPx`, `designTypography` |
| `Spinner` | `size`, `label` (`role="status"`) | `designColors.accentPrimary` |
| `Stack` | `direction`, `gap`, `align`, `justify`, `wrap` | `designSpacing.compactGapPx` (default gap) |
| `Separator` | `orientation` (`role="separator"`) | `designColors.borderDefault` |
| `Card` | — | `designColors.bgSurface/border*/textPrimary`, `designRadii.lgPx`, `designSpacing.comfortableGapPx` |

### Consumption

Because the primitives are styled with vanilla-extract, they are consumed
**from source** so the consumer's vanilla-extract bundler plugin compiles the
`.css.ts` files (the same way the repo already consumes `@blackout/design`).
The canonical client imports them via the workspace source path and dedupes
React to its single app instance (see the `resolve.dedupe` entries in the
client's `vite.config.ts` / `vitest.config.ts`).

```tsx
import { Button, Badge, IconButton, Stack } from '@blackout/ui/primitives';
```

Real adoption lives in
`apps/blackout-client/src/app/features/room/MessageComposer.tsx` (send button,
attachment chips, format-mark toolbar). Unit tests + render fixtures:
`apps/blackout-client/tests/unit/ui-primitives/primitives.test.tsx`.

### Build / test

- `pnpm --filter @blackout/ui run build` — emits ESM + type declarations
  (`dist/`, including `dist/primitives`).
- Primitive behavior is covered by the client's vitest project (jsdom +
  vanilla-extract plugin); `pnpm --filter @blackout/ui run test` runs the
  package type-check gate.
