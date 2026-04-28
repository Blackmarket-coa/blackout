/**
 * Shell-level protocol events. These are UI-internal events for cross-surface
 * panel selection and deep-linkable panel state — they are not Matrix room
 * events and therefore do not extend `BlackoutEventName` / `EventEnvelope`.
 *
 * Foundation for BKL-001 (`web.workspace.tabs`, `web.mobile.tabs`,
 * `web.sidebar.nav`).
 */

export const SHELL_PANEL_KINDS = ['workspace', 'mobile-tab', 'sidebar', 'right-panel'] as const;

export type ShellPanelKind = (typeof SHELL_PANEL_KINDS)[number];

export type ShellPanelSelectedPayload = {
    panelId: string;
    kind: ShellPanelKind;
    /**
     * Canonical client route the panel resolves to. Mirrors the `to` field on
     * the matching `ShellPanelEntry` in the canonical client manifest, so
     * receivers can deep-link without consulting the in-memory registry.
     */
    to: string;
    /**
     * Optional opaque state to round-trip across deep links — e.g. a tab
     * within a panel ("active|past|create"). Receivers should treat unknown
     * keys as ignorable.
     */
    state?: Record<string, string>;
};

export type ShellPanelSelectedEvent = {
    event: 'shell.panel.selected';
    occurredAt: string;
    payload: ShellPanelSelectedPayload;
};

export const SHELL_PANEL_SELECTED_EVENT_NAME = 'shell.panel.selected' as const;

export const isShellPanelSelectedEvent = (
    value: unknown
): value is ShellPanelSelectedEvent => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<ShellPanelSelectedEvent>;
    if (candidate.event !== SHELL_PANEL_SELECTED_EVENT_NAME) return false;
    if (typeof candidate.occurredAt !== 'string') return false;
    const payload = candidate.payload;
    if (!payload || typeof payload !== 'object') return false;
    if (typeof payload.panelId !== 'string') return false;
    if (typeof payload.to !== 'string') return false;
    return SHELL_PANEL_KINDS.includes(payload.kind as ShellPanelKind);
};
