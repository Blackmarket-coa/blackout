# Folds + Blackout Solarpunk Setup Guide

This guide wires **folds** (`github.com/cinnyapp/folds`) into `apps/blackout-client` as the base UI kit and layers Blackout brand theming on top.

---

## 1) Install folds as a dependency

From repository root:

```bash
pnpm --filter @blackout/client add folds
```

If folds publishes separate CSS, also import it in your app entrypoint (example in `src/main.tsx`):

```ts
import 'folds/dist/style.css';
```

> Keep the dependency pinned in `apps/blackout-client/package.json` after validating compatibility with React 18.

---

## 2) Create a wrapper layer in `src/app/components/base/`

The wrapper layer gives you one import surface and a place for Blackout defaults/variants.

### Suggested structure

```text
src/app/components/base/
  index.ts
  Button.tsx
  Input.tsx
  TextArea.tsx
  Avatar.tsx
  Badge.tsx
  Dialog.tsx
  Menu.tsx
  Tooltip.tsx
  Spinner.tsx
  Scroll.tsx
  IconButton.tsx
  Chip.tsx
  Header.tsx
  Text.tsx
```

### Wrapper example

```tsx
// src/app/components/base/Button.tsx
import type { ComponentProps } from 'react';
import { Button as FButton } from 'folds';

type ButtonProps = ComponentProps<typeof FButton>;

export const Button = (props: ButtonProps) => {
  return <FButton size="300" {...props} />;
};
```

```ts
// src/app/components/base/index.ts
export { Button } from './Button';
export { Input } from './Input';
export { TextArea } from './TextArea';
export { Avatar } from './Avatar';
export { Badge } from './Badge';
export { Dialog } from './Dialog';
export { Menu } from './Menu';
export { Tooltip } from './Tooltip';
export { Spinner } from './Spinner';
export { Scroll } from './Scroll';
export { IconButton } from './IconButton';
export { Chip } from './Chip';
export { Header } from './Header';
export { Text } from './Text';
```

Use the same pattern for the remaining wrappers, adding Blackout defaults only where needed.

---

## 3) Override folds CSS variables with Blackout palette

Apply overrides in a dedicated stylesheet, loaded once at app start.

```ts
// src/app/styles/folds-overrides.css.ts
import { globalStyle } from '@vanilla-extract/css';

globalStyle(':root', {
  '--folds-bg-surface': 'var(--bg-surface)',
  '--folds-bg-surface-hover': 'var(--bg-surface-hover)',
  '--folds-bg-nav': 'var(--bg-nav)',
  '--folds-bg-input': 'var(--bg-input)',
  '--folds-text-primary': 'var(--text-primary)',
  '--folds-text-secondary': 'var(--text-secondary)',
  '--folds-text-muted': 'var(--text-muted)',
  '--folds-accent-primary': 'var(--accent-primary)',
  '--folds-accent-hover': 'var(--accent-hover)',
  '--folds-accent-muted': 'var(--accent-muted)',
  '--folds-border-default': 'var(--border-default)',
  '--folds-border-active': 'var(--border-active)',
  '--folds-danger': 'var(--danger)',
  '--folds-warning': 'var(--warning)',
  '--folds-success': 'var(--success)',
} as Record<string, string>);
```

Then import this once in `src/main.tsx` after `theme.css.ts`:

```ts
import './app/styles/theme.css.ts';
import './app/styles/folds-overrides.css.ts';
```

> Confirm actual folds token names in its docs/source. Keep the mapping file as the single source of truth.

---

## 4) Create a Storybook-like preview page at `/dev/components`

Add a dev-only page that renders all wrapped components with state examples.

### Route wiring

```tsx
// src/main.tsx (router excerpt)
const router = createBrowserRouter([
  { path: '/', element: null },
  {
    path: '/dev/components',
    element: <DevComponentsPage />,
  },
]);
```

### Preview page scaffold

```tsx
// src/app/pages/client/DevComponentsPage.tsx
import { Fragment } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Chip,
  Dialog,
  Header,
  IconButton,
  Input,
  Menu,
  Scroll,
  Spinner,
  Text,
  TextArea,
  Tooltip,
} from '../../components/base';

export const DevComponentsPage = () => {
  return (
    <div style={{ padding: 24 }}>
      <Header>Folds Components (Blackout Dark Theme)</Header>

      {/* Button */}
      <section>
        <Text>Button</Text>
        <Button>Default</Button>
        <Button data-hovered>Hover</Button>
        <Button data-pressed>Active</Button>
        <Button disabled>Disabled</Button>
        <Button autoFocus>Focus</Button>
      </section>

      {/* Repeat same state matrix for: Input, TextArea, Avatar, Badge, Dialog,
          Menu, Tooltip, Spinner, Scroll, IconButton, Chip, Header, Text */}

      <section>
        <Text>Input</Text>
        <Input placeholder="Default" />
        <Input placeholder="Disabled" disabled />
      </section>

      <section>
        <Text>Spinner</Text>
        <Spinner />
      </section>

      <section>
        <Text>Tooltip</Text>
        <Tooltip content="Tooltip text">
          <Button>Hover me</Button>
        </Tooltip>
      </section>

      <Fragment />
    </div>
  );
};
```

> Some states like `:hover` and `:active` cannot be forced semantically for every component without test helpers. Use one of these approaches for consistent previews:
> - Storybook pseudo-states addon equivalent.
> - Playwright/Cypress visual state harness.
> - Wrapper `data-state` attributes and companion demo CSS selectors.

---

## Verification Matrix (Dark Theme)

On `/dev/components`, verify each component in:
- default
- hover
- active
- disabled
- focus

Components:
- Button
- Input
- TextArea
- Avatar
- Badge
- Dialog
- Menu
- Tooltip
- Spinner
- Scroll
- IconButton
- Chip
- Header
- Text

Recommended validation:

1. Manual check in browser at 100% zoom and 125% zoom.
2. Keyboard-only focus pass (`Tab`, `Shift+Tab`, `Enter`, `Space`).
3. Contrast audit (WCAG AA for text and interactive states).
4. Screenshot snapshots for each component/state row.

---

## Rollout Notes

- Keep all app imports pointed to `src/app/components/base` (never import from `folds` directly in feature code).
- Changes to brand theming should only touch:
  - `src/app/styles/theme.css.ts`
  - `src/app/styles/folds-overrides.css.ts`
- Add CI snapshots for `/dev/components` once the page is implemented.
