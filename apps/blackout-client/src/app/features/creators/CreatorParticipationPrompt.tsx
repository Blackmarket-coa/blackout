import { Link } from 'react-router';
import { useCapabilityContext } from '../../core/features/capabilityContext';
import { CREATOR_SELL_PATH, STREAMING_PATH } from '../../pages/paths';

/** Contextual entry points into existing editors; never inserts ranked feed items. */
export function CreatorParticipationPrompt() {
    const { flags } = useCapabilityContext();
    const canSell = Boolean(flags?.creatorsListings);
    const canPublish = Boolean(flags?.streaming && flags?.creatorContent);
    if (!canSell && !canPublish) return null;

    const linkStyle = {
        padding: '8px 12px',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        color: 'inherit',
        textDecoration: 'none',
    };

    return (
        <section
            aria-label="Make something useful"
            data-testid="creator-participation-prompt"
            style={{
                display: 'grid',
                gap: 10,
                padding: 16,
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                marginBottom: 12,
            }}
        >
            <strong>Make something others can use</strong>
            <p style={{ margin: 0 }}>
                Package a useful file, design an asset pack, or share something you know.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {canSell ? (
                    <>
                        <Link
                            to={`${CREATOR_SELL_PATH}?template=digital_download`}
                            style={linkStyle}
                        >
                            Sell a download
                        </Link>
                        <Link to={`${CREATOR_SELL_PATH}?template=asset_bundle`} style={linkStyle}>
                            Create an asset pack
                        </Link>
                    </>
                ) : null}
                {canPublish ? (
                    <Link to={`${STREAMING_PATH}?compose=guide#creator-content`} style={linkStyle}>
                        Publish a free guide
                    </Link>
                ) : null}
            </div>
        </section>
    );
}
