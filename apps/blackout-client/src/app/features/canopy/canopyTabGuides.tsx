import React, { type ReactNode } from 'react';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import type { CanopyHubTabId } from '../../state/canopy';

/**
 * One-line, newcomer-friendly explainers for each canopies hub tab. Rendered in
 * a lingering {@link FeatureGuide} strip, mirroring `coliseumTabGuides.tsx`.
 */
export const CANOPY_HUB_TAB_GUIDES: Record<CanopyHubTabId, ReactNode> = {
    yours: (
        <>
            The {BLACKOUT_TERMS.canopy.plural} you have joined — each one is a community made of{' '}
            <strong>{BLACKOUT_TERMS.den.plural}</strong>. Open one to read its channels.
        </>
    ),
    discover: (
        <>
            Find new {BLACKOUT_TERMS.canopy.plural} and public {BLACKOUT_TERMS.den.plural} to join,
            across this server and the wider federation.
        </>
    ),
    coalitions: (
        <>
            The coalitions you belong to, your role in each, and invitations waiting on you.
            Coalitions run drives, projects and mutual aid together across canopies.
        </>
    ),
    create: (
        <>
            Start a new {BLACKOUT_TERMS.canopy.singular} from scratch, or import an existing
            structure from Discord.
        </>
    ),
};
