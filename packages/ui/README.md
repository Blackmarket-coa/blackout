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

### B1.1 (remaining primitives)

Forms, display, layout, navigation and overlay primitives. Overlays are
hand-rolled (no positioning/focus-trap dependency): `createPortal` to
`document.body` for `Modal`/`Sheet`/`Toast`, CSS placement props for
`Tooltip`/`Popover`/`Menu`. **v1 has no viewport collision detection** — callers
pick a side that fits; smart flipping is a future enhancement.

| Primitive | Props (key) | Notes |
| --- | --- | --- |
| `TextArea` | `invalid` | styled native `<textarea>` |
| `Select` | `invalid` | styled native `<select>`; pass `<option>` children |
| `Checkbox` | `label` | native `<input type=checkbox>` + label |
| `Radio` | `label` | native `<input type=radio>` + label |
| `Switch` | `checked`, `onCheckedChange` | `role="switch"` toggle |
| `Avatar` | `src`, `name`, `size` | image with initials fallback |
| `EmptyState` | `title`, `description`, `icon`, `action` | centered placeholder |
| `Inline` | `gap`, `align` | non-wrapping flex row |
| `Cluster` | `gap`, `justify`, `align` | wrapping group |
| `Grid` | `columns`, `minItemWidth`, `gap` | CSS grid (fixed or auto-fill) |
| `Tabs` | `items`, `value`/`defaultValue`, `onValueChange` | roving-tabindex `role="tablist"` |
| `Tooltip` | `content`, `placement` | hover/focus; `aria-describedby` link |
| `Popover` | `trigger`, `placement`, `open`/`onOpenChange` | click-toggle `role="dialog"`; Escape + outside-click dismiss |
| `Menu` | `trigger`, `items`, `placement` | `role="menu"` keyboard nav; Escape + outside-click dismiss |
| `Modal` | `open`, `onClose`, `title` | portal `aria-modal` dialog; Escape + backdrop close; focus restore |
| `Sheet` | `open`, `onClose`, `title` | portal bottom-sheet (web generalization of `OverflowSheet`) |
| `ToastProvider` / `useToast` | `toast({ message, tone, duration })`, `dismiss(id)` | portal viewport with auto-dismiss |

B1.1 tests + fixtures: `apps/blackout-client/tests/unit/ui-primitives/primitives-b11.test.tsx`.

### Consumption

Because the primitives are styled with vanilla-extract, they are consumed
**from source** so the consumer's vanilla-extract bundler plugin compiles the
`.css.ts` files (the same way the repo already consumes `@blackout/design`).
The canonical client aliases `@blackout/ui/primitives` to the workspace
source (`resolve.alias` in its `vite.config.ts` / `vitest.config.ts`, plus a
tsconfig `paths` entry) and dedupes React to its single app instance (see the
`resolve.dedupe` entries in the same configs), so the import below is exactly
what production code writes.

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
