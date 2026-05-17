import React from 'react';
import { Text } from 'folds';
import type { DenPlaybookPayload } from '@blackout/protocol';
import { PLAYBOOK_ACCENT_TOKENS } from '../../styles/playbookTokens';
import { DenSignatureBadge } from './DenSignatureBadge';
import { LeadershipGlyph } from './LeadershipGlyph';
import { PhenologyBar } from './PhenologyBar';
import * as css from './DenSignature.css';

/**
 * Composes the three signature primitives into the strip that sits above a
 * den's title row. Governance-active dens get the strip; casual dens (Hearth)
 * don't, per the brief's rule that "casual dens should look like Cinny's
 * existing rooms" and that no background pattern fights the message stream.
 *
 * The strip's tint is the den's accent token in soft form. The phenology bar
 * sits beneath the row so health and lifecycle stay glanceable.
 */
export interface DenHeaderStripProps {
    playbook: DenPlaybookPayload;
}

export function DenHeaderStrip({ playbook }: DenHeaderStripProps) {
    if (!playbook.features.governanceActive) return null;
    const accent =
        PLAYBOOK_ACCENT_TOKENS[playbook.accent] ?? PLAYBOOK_ACCENT_TOKENS.moss;
    const trialBadge = playbook.mode === 'trial' ? ' · 14-day try' : '';

    return (
        <div
            className={css.HeaderStrip}
            style={{ background: accent.soft }}
            aria-label={`${playbook.name} signature`}
        >
            <div className={css.HeaderStripRow}>
                <DenSignatureBadge
                    shape={playbook.structure}
                    accent={playbook.accent}
                    size="sm"
                />
                <LeadershipGlyph kind={playbook.leadership} size="sm" color={accent.solid} />
                <Text size="T200" style={{ color: accent.solid }}>
                    {playbook.name}
                    {trialBadge}
                </Text>
                {playbook.domain && (
                    <Text
                        size="T200"
                        truncate
                        className={css.HeaderStripDomain}
                        style={{ color: accent.solid }}
                    >
                        — {playbook.domain}
                    </Text>
                )}
            </div>
            <PhenologyBar phase={playbook.phase} />
        </div>
    );
}
