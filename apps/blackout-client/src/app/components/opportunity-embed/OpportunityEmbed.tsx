import type { CSSProperties } from 'react';
import {
    parseOpportunityEvent,
    type OpportunityKind,
    type OpportunityRef,
} from './opportunityEmbedSchema';

const KIND_LABEL: Record<OpportunityKind, string> = {
    product_opportunity: 'Product opportunity',
    market_demand: 'Market demand',
    launch: 'Launch opportunity',
};

const stripStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '4px 0',
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 12px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #0f172a)',
};

const badgeStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--text-muted, #9ca3af)',
};

const titleRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };

function OpportunityCard({ opportunity }: { opportunity: OpportunityRef }) {
    return (
        <article
            style={cardStyle}
            data-testid="opportunity-card"
            data-opportunity-kind={opportunity.kind}
        >
            <div style={titleRowStyle}>
                <span style={badgeStyle}>{KIND_LABEL[opportunity.kind]}</span>
                <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{opportunity.title}</span>
                {opportunity.metric ? (
                    <span style={{ fontSize: 13, color: 'var(--accent-primary, #3b82f6)', fontWeight: 600 }}>
                        {opportunity.metric}
                    </span>
                ) : null}
            </div>
            {opportunity.summary ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)' }}>
                    {opportunity.summary}
                </span>
            ) : null}
            {opportunity.url ? (
                <a
                    href={opportunity.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, color: 'var(--accent-primary, #3b82f6)' }}
                >
                    View in FBM →
                </a>
            ) : null}
        </article>
    );
}

/**
 * Renderer for `co.bmc.opportunity` events. Display-only: it renders whatever
 * opportunity cards FBM posted into the event content. Returns null for empty /
 * malformed content so it never adds chrome on a no-op.
 */
export function OpportunityEmbed({ content }: { content: unknown }): JSX.Element | null {
    const { opportunities } = parseOpportunityEvent(content);
    if (opportunities.length === 0) return null;
    return (
        <section style={stripStyle} data-testid="opportunity-embed">
            {opportunities.map((opportunity, index) => (
                <OpportunityCard key={`${opportunity.kind}:${opportunity.title}:${index}`} opportunity={opportunity} />
            ))}
        </section>
    );
}

export default OpportunityEmbed;
