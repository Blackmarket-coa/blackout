import React from 'react';
import { Box, Chip, Text } from 'folds';
import { selectRadialActions, type RadialAction, type RadialContext } from '@blackout/core';
import type { DenPlaybookPayload } from '@blackout/protocol';

/**
 * Web fallback for the mobile RadialBloom wheel. Renders the same
 * context-derived action list as a horizontal Folds Chip strip — visible
 * at the top of a room view on desktop / tablet where the radial isn't
 * yet shipped.
 *
 * The web equivalent of the full radial wheel is explicitly deferred to a
 * later release per the plan's "Open decision points" — this strip is the
 * minimal usable surface that lets the rest of the system reason about
 * governance wedges before the wheel lands.
 */
export interface DenWedgeStripProps {
    playbook: DenPlaybookPayload | null;
    awaitsMe?: boolean;
    memberCount?: number;
    onAction?: (label: RadialAction['label']) => void;
}

export function DenWedgeStrip({
    playbook,
    awaitsMe,
    memberCount,
    onAction,
}: DenWedgeStripProps) {
    const ctx: RadialContext = {
        playbookActive: !!playbook?.features.governanceActive,
        features: playbook?.features,
        awaitsMe,
        memberCount,
    };
    const actions = selectRadialActions(ctx);
    return (
        <Box data-testid="den-wedge-strip" gap="100" alignItems="Center">
            {actions.map((action) => (
                <Chip
                    key={action.label}
                    as="button"
                    type="button"
                    radii="Pill"
                    variant={action.pulses ? 'Primary' : 'SurfaceVariant'}
                    aria-pressed={false}
                    aria-label={
                        action.pulses ? `${action.label} (awaits your response)` : action.label
                    }
                    onClick={() => onAction?.(action.label)}
                    data-testid={`den-wedge-${action.label.toLowerCase()}`}
                >
                    <Text size="T200">{action.label}</Text>
                </Chip>
            ))}
        </Box>
    );
}
