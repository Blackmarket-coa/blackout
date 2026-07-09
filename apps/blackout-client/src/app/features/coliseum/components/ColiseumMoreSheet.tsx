import React from 'react';
import type { ColiseumTabId } from '@blackout/core';
import { Sheet } from '../../../../../../../packages/ui/src/primitives';
import { coliseumSheetTheme } from '../coliseumArenaTheme.css';
import { COLISEUM_TAB_LABELS } from '../../../state/coliseum';
import { COLISEUM_TAB_GUIDES } from '../coliseumTabGuides';
import { cx } from './cx';
import * as css from './coliseumUi.css';

/**
 * Bottom sheet listing the secondary Coliseum surfaces (Arena, Match, Shouts,
 * Leaderboards, Sources) so the tab strip can stay TikTok-slim.
 */
export function ColiseumMoreSheet({
    open,
    onClose,
    tabs,
    activeTab,
    onSelectTab,
}: {
    open: boolean;
    onClose: () => void;
    tabs: ColiseumTabId[];
    activeTab: ColiseumTabId;
    onSelectTab: (tab: ColiseumTabId) => void;
}) {
    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="More in Coliseum"
            backdropTestId="coliseum-more-backdrop"
            className={coliseumSheetTheme}
        >
            <div className={css.moreSheetList} data-testid="coliseum-more-sheet">
                {tabs.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        className={cx(
                            css.moreSheetRow,
                            tab === activeTab ? css.moreSheetRowActive : undefined
                        )}
                        data-coliseum-tab={tab}
                        aria-current={tab === activeTab ? 'true' : undefined}
                        onClick={() => {
                            onSelectTab(tab);
                            onClose();
                        }}
                    >
                        <span className={css.moreSheetRowTitle}>{COLISEUM_TAB_LABELS[tab]}</span>
                        <span className={css.moreSheetRowDescription}>
                            {COLISEUM_TAB_GUIDES[tab]}
                        </span>
                    </button>
                ))}
            </div>
        </Sheet>
    );
}

export default ColiseumMoreSheet;
