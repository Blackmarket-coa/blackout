# V1 Component Roadmap

This roadmap defines the first stable contract for core UI primitives using the token system in `design-tokens.example.json`.

## Naming & API Conventions
- Prefer controlled + uncontrolled support where meaningful (`value` + `defaultValue`).
- Event props use `on*` naming and pass strongly typed payloads.
- Visual variants map to semantic tokens (e.g., `color.state.danger`, `color.interactive.primary`).
- Every interactive component must expose `data-testid` and `className` overrides.

---

## 1) Button

### Props contract
```ts
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;          // default: 'primary'
  size?: ButtonSize;                // default: 'md'
  disabled?: boolean;
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  className?: string;
  testId?: string;
}
```

### Accessibility requirements
- Use native `<button>` element.
- Must be reachable by keyboard and triggerable with Enter/Space.
- Preserve visible focus ring (do not remove outline without replacement).
- If icon-only, require `ariaLabel`.
- When `loading`, set `aria-busy="true"` and prevent double submit.

### Visual states
- default, hover, active/pressed, focus-visible, disabled, loading.
- variant-specific color tokens for background, text, border.

### Testing checklist
- Renders with default props and each variant/size.
- Disabled suppresses click handlers.
- Keyboard interaction (Enter/Space) works.
- Loading state shows spinner and locks interaction.
- Icon-only button fails lint/runtime check without label.

---

## 2) Input (text-like)

### Props contract
```ts
export type InputStatus = 'default' | 'success' | 'warning' | 'error';

export interface InputProps {
  id?: string;
  name?: string;
  type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url';
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  status?: InputStatus;
  label?: string;
  hint?: string;
  errorMessage?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  maxLength?: number;
  onChange?: (value: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  ariaDescribedBy?: string;
  className?: string;
  testId?: string;
}
```

### Accessibility requirements
- Associate `<label>` with input via `htmlFor`/`id`.
- Connect hint/error text with `aria-describedby`.
- Set `aria-invalid="true"` when in error status.
- Maintain 44x44px min target for touch contexts.
- Ensure placeholder is not the sole label.

### Visual states
- default, hover, focus-visible, filled, disabled, read-only.
- semantic status ring/border: success, warning, error.

### Testing checklist
- Controlled/uncontrolled behavior parity.
- Label/hint/error semantics and IDs wired correctly.
- Status styles render as expected.
- Keyboard tab focus and typing behavior.
- Max-length and disabled/readOnly guardrails.

---

## 3) Card

### Props contract
```ts
export interface CardProps {
  as?: 'article' | 'section' | 'div';
  elevated?: boolean;
  interactive?: boolean;
  selected?: boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  href?: string;
  className?: string;
  testId?: string;
}
```

### Accessibility requirements
- Non-interactive card should not be focusable.
- Interactive card must be keyboard accessible (`button`/`a` semantics).
- Preserve heading hierarchy in card header content.
- Provide clear focus-visible treatment when interactive.

### Visual states
- default, elevated, selected, interactive-hover, interactive-focus, disabled (if supported).

### Testing checklist
- Structural slots render (header/body/footer).
- `interactive=true` adds proper role/tab behavior.
- Selected state style and semantics (e.g., `aria-pressed` when applicable).
- Link card (`href`) uses anchor semantics.

---

## 4) Modal

### Props contract
```ts
export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnOverlayClick?: boolean;    // default: true
  closeOnEsc?: boolean;             // default: true
  initialFocusRef?: React.RefObject<HTMLElement>;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  testId?: string;
}
```

### Accessibility requirements
- Use `role="dialog"` and `aria-modal="true"`.
- Set `aria-labelledby`/`aria-describedby` to title/description IDs.
- Trap focus while open; restore focus on close.
- Close on Escape unless explicitly disabled.
- Prevent background scroll and mark app root inert/hidden as needed.

### Visual states
- closed, entering, open, exiting.
- overlay: default + animated opacity.
- dialog: default + focus ring for internal controls.

### Testing checklist
- Focus trap and return-focus behavior.
- Escape/overlay close behavior toggles.
- Correct ARIA attributes and IDs.
- Body scroll lock and cleanup on unmount.
- Portal rendering and stacking (`z-index`) sanity.

---

## 5) Navigation (top/side primitive)

### Props contract
```ts
export interface NavItem {
  id: string;
  label: string;
  href?: string;
  icon?: React.ReactNode;
  badgeCount?: number;
  disabled?: boolean;
  children?: NavItem[];
}

export interface NavProps {
  items: NavItem[];
  activeId?: string;
  onItemSelect?: (item: NavItem) => void;
  orientation?: 'horizontal' | 'vertical';
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  ariaLabel: string;
  className?: string;
  testId?: string;
}
```

### Accessibility requirements
- Wrap with `<nav aria-label="...">`.
- Use list semantics (`ul/li`) for groups.
- Active item exposes `aria-current="page"` when route-based.
- Full keyboard support (arrow navigation for roving focus if using composite widget patterns).
- Expand/collapse controls expose `aria-expanded` and `aria-controls`.

### Visual states
- default, hover, active/current, focus-visible, disabled, collapsed.
- nested item states for expanded/collapsed groups.

### Testing checklist
- Active state mapping with `activeId`.
- Keyboard navigation across items and groups.
- `aria-current`, `aria-expanded`, and labeling correctness.
- Disabled items ignore pointer/keyboard activation.

---

## 6) Message Bubble (chat)

### Props contract
```ts
export type MessageRole = 'incoming' | 'outgoing' | 'system';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageBubbleProps {
  id: string;
  role: MessageRole;
  content: React.ReactNode;
  timestamp: string;                // ISO-8601 preferred
  status?: MessageStatus;
  senderName?: string;
  avatar?: React.ReactNode;
  edited?: boolean;
  reactions?: Array<{ emoji: string; count: number; reactedByMe?: boolean }>;
  onRetry?: (id: string) => void;
  onReactionToggle?: (id: string, emoji: string) => void;
  onContextMenu?: (id: string) => void;
  className?: string;
  testId?: string;
}
```

### Accessibility requirements
- Use semantic container (`article`/`li`) within chat log region.
- Parent log should use `role="log"` with polite live-region behavior for new messages.
- Provide text alternative for status icons (e.g., `aria-label="Message failed"`).
- Ensure sufficient contrast between incoming/outgoing bubbles in dark theme.

### Visual states
- role styles: incoming, outgoing, system.
- status styles: sending, sent, delivered, read, failed.
- interaction states: hover, focus-visible, selected (for multi-select actions).

### Testing checklist
- Role and status visual mappings.
- Timestamp formatting and semantic `<time>` usage.
- Retry callback only available for failed messages.
- Reaction toggle behavior and count updates.
- Screen-reader announcement behavior in message log.

---

## Delivery sequencing (recommended)
1. **Button + Input** (foundation for forms/actions)
2. **Card + Nav** (layout and IA primitives)
3. **Modal** (interaction container + focus management)
4. **Message Bubble** (domain-specific chat primitive)

## Definition of done (applies to all components)
- API docs with examples (Storybook/MDX).
- Unit tests + accessibility tests (axe).
- Visual regression snapshots for all states.
- Token usage verification: no hard-coded colors/spacing/typography except temporary migration shims.
