import React from 'react';
import { Link } from 'react-router';
import { EMBED_PATH } from '../../pages/paths';
import { cardStyle, linkStyle, mutedTextStyle } from './embedStyles';

/**
 * Shown in place of anything the panel does not display. Offers the same
 * thing in a normal Blackout tab; never navigates the panel's frame there.
 */
export const EmbedNotShown = ({
    reason,
    note = 'The chat panel shows canopies, dens and direct messages only.',
    openUrl,
    openPath,
}: {
    reason: string;
    /** The muted second line; defaults to what the panel shows. */
    note?: string;
    /** Absolute same-origin URL to open in Blackout. */
    openUrl?: string;
    /** Same-origin path to open in Blackout (used when `openUrl` is absent). */
    openPath?: string;
}) => (
    <div style={cardStyle} data-testid="embed-not-shown" role="status">
        <p style={{ margin: 0 }}>{reason}</p>
        <p style={mutedTextStyle}>{note}</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <a
                href={openUrl ?? openPath ?? '/'}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
                data-testid="embed-not-shown-open"
                data-embed-open="tab"
            >
                Open in Blackout ↗
            </a>
            <Link to={EMBED_PATH} style={linkStyle}>
                Back to chats
            </Link>
        </div>
    </div>
);

export default EmbedNotShown;
