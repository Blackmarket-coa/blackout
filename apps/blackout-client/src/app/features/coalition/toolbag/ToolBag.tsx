import React, { useCallback, useMemo } from 'react';
import type { CoalitionTabId, DenType } from '@blackout/core';
import { Sheet } from '@blackout/ui/primitives';
import { COALITION_TAB_LABELS } from '../../../state/coalition';
import type { CoalitionScopeQuery } from '../hooks/useCoalitionFeed';
import ChatTab from '../tabs/ChatTab';
import RingsTab from '../tabs/RingsTab';
import KitsTab from '../tabs/KitsTab';
import TasksTab from '../tabs/TasksTab';
import NeedsTab from '../tabs/NeedsTab';
import ProjectsTab from '../tabs/ProjectsTab';
import ResourcesTab from '../tabs/ResourcesTab';
import { DocumentsTab } from '../../documents/DocumentsTab';
import AiDenPanel from '../../aiden/AiDenPanel';
import { resolveToolBag, type ToolBagEntry } from './toolbag';
import * as css from './ToolBag.css';

export interface ToolBagProps {
    open: boolean;
    onSetOpen: (open: boolean) => void;
    scope: CoalitionScopeQuery;
    denId: string | null;
    denType: DenType;
    aiEnabled: boolean;
    /** Per-den gate from the `co.bmc.coalition` state event. */
    enabledTabs?: readonly CoalitionTabId[];
    /**
     * The tool currently in hand, or null for the bag grid. Controlled by the
     * parent so a map pin can send you straight to its board.
     */
    tool: CoalitionTabId | null;
    onSetTool: (tool: CoalitionTabId | null) => void;
}

function ToolBody({
    tool,
    scope,
    denId,
    denType,
}: {
    tool: CoalitionTabId;
    scope: CoalitionScopeQuery;
    denId: string | null;
    denType: DenType;
}) {
    switch (tool) {
        case 'chat':
            return <ChatTab denId={denId} />;
        case 'rings':
            return <RingsTab />;
        case 'tasks':
            return <TasksTab scope={scope} />;
        case 'needs':
            return <NeedsTab scope={scope} />;
        case 'projects':
            return <ProjectsTab scope={scope} />;
        case 'resources':
            return <ResourcesTab scope={scope} />;
        case 'kits':
            return <KitsTab scope={scope} />;
        case 'documents':
            return denId ? <DocumentsTab roomId={denId} /> : null;
        case 'ai':
            return <AiDenPanel roomId={denId} denType={denType} />;
        default:
            return null;
    }
}

/**
 * Everything that isn't a place.
 *
 * Coalition's twelve tabs used to sit in a strip whose only overflow handling
 * was `overflowX: 'auto'` — no scroll affordance, no overflow sheet, so seven
 * of them simply ran off the side of a phone. The map is the world now, and
 * these are the things you carry: an inventory you open over it and close to
 * get back.
 *
 * Which tools are present still comes from `enabledTabs`, so a Coalition Kit
 * configures the bag exactly the way it used to configure the strip.
 */
export function ToolBag({
    open,
    onSetOpen,
    scope,
    denId,
    denType,
    aiEnabled,
    enabledTabs,
    tool,
    onSetTool,
}: ToolBagProps) {
    const entries = useMemo(
        () => resolveToolBag({ enabledTabs, hasDen: Boolean(denId), aiEnabled }),
        [enabledTabs, denId, aiEnabled]
    );

    // Closing the sheet empties your hands too, so reopening starts at the bag
    // rather than dropping you back into whatever you last used.
    const close = useCallback(() => {
        onSetOpen(false);
        onSetTool(null);
    }, [onSetOpen, onSetTool]);

    const title = tool ? COALITION_TAB_LABELS[tool] : 'Tool bag';

    return (
        <>
            <button
                type="button"
                className={css.bagButton}
                onClick={() => onSetOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={open}
                data-testid="coalition-toolbag-button"
            >
                <span className={css.bagGlyph} aria-hidden>
                    🎒
                </span>
                Tools
                <span className={css.bagCount}>{entries.length}</span>
            </button>

            <Sheet open={open} onClose={close} title={title}>
                {tool ? (
                    <div className={css.toolFrame} data-testid={`coalition-tool-${tool}`}>
                        <div className={css.toolBar}>
                            <button
                                type="button"
                                className={css.backButton}
                                onClick={() => onSetTool(null)}
                                data-testid="coalition-tool-back"
                            >
                                ← Bag
                            </button>
                            <span className={css.toolTitle}>{COALITION_TAB_LABELS[tool]}</span>
                        </div>
                        <div className={css.toolBody}>
                            <ToolBody tool={tool} scope={scope} denId={denId} denType={denType} />
                        </div>
                    </div>
                ) : entries.length === 0 ? (
                    <p className={css.emptyBag} data-testid="coalition-toolbag-empty">
                        This den has no tools enabled. Open a Coalition Kit to add some.
                    </p>
                ) : (
                    <div className={css.grid} data-testid="coalition-toolbag-grid">
                        {entries.map((entry: ToolBagEntry) => (
                            <button
                                key={entry.id}
                                type="button"
                                className={css.tile}
                                onClick={() => onSetTool(entry.id)}
                                data-coalition-tool={entry.id}
                                data-testid={`coalition-toolbag-tile-${entry.id}`}
                            >
                                <span className={css.tileGlyph} aria-hidden>
                                    {entry.glyph}
                                </span>
                                <span className={css.tileLabel}>{entry.label}</span>
                                <span className={css.tileHint}>{entry.hint}</span>
                            </button>
                        ))}
                    </div>
                )}
            </Sheet>
        </>
    );
}

export default ToolBag;
