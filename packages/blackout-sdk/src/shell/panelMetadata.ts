import {
    SHELL_PANEL_KINDS,
    SHELL_PANEL_SELECTED_EVENT_NAME,
    isShellPanelSelectedEvent,
    type ShellPanelKind,
    type ShellPanelSelectedEvent,
    type ShellPanelSelectedPayload,
} from '@blackout/protocol';

export type PanelMetadata = {
    id: string;
    kind: ShellPanelKind;
    label: string;
    to: string;
    /**
     * Capability list a caller must satisfy in order for this panel to be
     * available. Empty/undefined means always available.
     */
    requires?: readonly string[];
    /**
     * Lower numbers render first within their `kind`.
     */
    order?: number;
};

export type ShellPanelCatalog = {
    panels: readonly PanelMetadata[];
    listPanels: (kind?: ShellPanelKind) => PanelMetadata[];
    findPanel: (panelId: string) => PanelMetadata | undefined;
    canAccess: (panelId: string, capabilities: readonly string[]) => boolean;
    /**
     * Convenience helper that builds a typed `shell.panel.selected` event
     * payload for a given panel id and optional state. Returns `null` if no
     * panel with that id exists in the catalog.
     */
    buildSelectionEvent: (
        panelId: string,
        options?: { state?: Record<string, string>; occurredAt?: string }
    ) => ShellPanelSelectedEvent | null;
};

export const createShellPanelCatalog = (
    panels: readonly PanelMetadata[]
): ShellPanelCatalog => {
    const byId = new Map<string, PanelMetadata>();
    for (const panel of panels) {
        if (byId.has(panel.id)) {
            throw new Error(
                `[shell-panel-catalog] duplicate panel id "${panel.id}" detected`
            );
        }
        byId.set(panel.id, panel);
    }

    const listPanels = (kind?: ShellPanelKind): PanelMetadata[] => {
        const filtered = kind ? panels.filter((p) => p.kind === kind) : [...panels];
        return filtered.sort((left, right) => {
            if (left.kind !== right.kind) {
                return left.kind.localeCompare(right.kind);
            }
            const leftOrder = left.order ?? Number.POSITIVE_INFINITY;
            const rightOrder = right.order ?? Number.POSITIVE_INFINITY;
            return leftOrder - rightOrder;
        });
    };

    const findPanel = (panelId: string) => byId.get(panelId);

    const canAccess = (panelId: string, capabilities: readonly string[]): boolean => {
        const panel = byId.get(panelId);
        if (!panel) return false;
        if (!panel.requires || panel.requires.length === 0) return true;
        const owned = new Set(capabilities);
        return panel.requires.every((cap) => owned.has(cap));
    };

    const buildSelectionEvent = (
        panelId: string,
        options?: { state?: Record<string, string>; occurredAt?: string }
    ): ShellPanelSelectedEvent | null => {
        const panel = byId.get(panelId);
        if (!panel) return null;
        const payload: ShellPanelSelectedPayload = {
            panelId: panel.id,
            kind: panel.kind,
            to: panel.to,
            ...(options?.state ? { state: options.state } : {}),
        };
        return {
            event: SHELL_PANEL_SELECTED_EVENT_NAME,
            occurredAt: options?.occurredAt ?? new Date().toISOString(),
            payload,
        };
    };

    return {
        panels,
        listPanels,
        findPanel,
        canAccess,
        buildSelectionEvent,
    };
};

export {
    SHELL_PANEL_KINDS,
    SHELL_PANEL_SELECTED_EVENT_NAME,
    isShellPanelSelectedEvent,
    type ShellPanelKind,
    type ShellPanelSelectedEvent,
    type ShellPanelSelectedPayload,
};
