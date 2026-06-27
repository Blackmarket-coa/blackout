// Read-only Creator Hub view of active Smart Split Contracts.
//
// Split contracts are immutable `co.bmc.split_contract` state events recorded in
// a creator's Space (written by FBM via the Blackout split-contracts endpoint).
// This surface only *reads* them: it enumerates the spaces the creator is in,
// lists each contract's parties and shares, and links to the canonical Matrix
// event. Activation/archival happens from the FBM creator portal — the copy here
// makes the immutability guarantee explicit.
import React, { type CSSProperties, useMemo } from 'react';
import {
    SPLIT_CONTRACT_EVENT_TYPE,
    isSplitContractPayload,
    type SplitContractPayload,
} from '@blackout/protocol';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';

interface SpaceContracts {
    spaceId: string;
    spaceName: string;
    contracts: Array<{ eventId: string; contract: SplitContractPayload }>;
}

const wrapStyle: CSSProperties = { display: 'grid', gap: 16, padding: 16 };
const headingStyle: CSSProperties = { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' };
const noteStyle: CSSProperties = {
    fontSize: 12,
    color: 'var(--text-muted)',
    background: 'var(--bg-surface-low)',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    padding: '8px 10px',
};
const cardStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
    padding: 12,
    display: 'grid',
    gap: 8,
    maxWidth: 520,
};
const cardHeaderStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
};
const badgeStyle: CSSProperties = {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--text-muted)',
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    padding: '1px 8px',
};
const partyRowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    color: 'var(--text-primary)',
};
const mutedStyle: CSSProperties = { fontSize: 12, color: 'var(--text-muted)' };
const linkStyle: CSSProperties = { fontSize: 12, color: 'var(--accent-primary)', wordBreak: 'break-all' };

function permalink(spaceId: string, eventId: string): string {
    return `https://matrix.to/#/${encodeURIComponent(spaceId)}/${encodeURIComponent(eventId)}`;
}

export function SplitContracts() {
    const mx = useMatrixClientOrNull();

    const spaces = useMemo<SpaceContracts[]>(() => {
        if (!mx) return [];
        const out: SpaceContracts[] = [];
        for (const room of mx.getRooms()) {
            if (!room.isSpaceRoom()) continue;
            const events = room.currentState.getStateEvents(SPLIT_CONTRACT_EVENT_TYPE);
            const contracts: SpaceContracts['contracts'] = [];
            for (const event of events) {
                const content = event.getContent();
                if (isSplitContractPayload(content)) {
                    contracts.push({ eventId: event.getId() ?? '', contract: content });
                }
            }
            if (contracts.length > 0) {
                out.push({ spaceId: room.roomId, spaceName: room.name ?? room.roomId, contracts });
            }
        }
        return out;
    }, [mx]);

    return (
        <section style={wrapStyle} data-testid="streaming-tab-splits">
            <div style={headingStyle}>Smart Split Contracts</div>
            <div style={noteStyle}>
                Split contracts are recorded permanently on your Space and cannot be modified —
                only archived. Activate or archive them from the FBM creator portal.
            </div>
            {spaces.length === 0 ? (
                <div style={mutedStyle}>No active split contracts in your spaces yet.</div>
            ) : (
                spaces.map((space) => (
                    <div key={space.spaceId} style={{ display: 'grid', gap: 10 }}>
                        <div style={{ ...mutedStyle, fontWeight: 600 }}>{space.spaceName}</div>
                        {space.contracts.map(({ eventId, contract }) => (
                            <article key={contract.contractId} style={cardStyle}>
                                <div style={cardHeaderStyle}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {contract.name}
                                    </div>
                                    <span style={badgeStyle}>{contract.status}</span>
                                </div>
                                {contract.parties.map((party) => (
                                    <div key={party.matrixId} style={partyRowStyle}>
                                        <span>
                                            {party.matrixId} <span style={mutedStyle}>({party.role})</span>
                                        </span>
                                        <strong>{party.percentage}%</strong>
                                    </div>
                                ))}
                                <div style={mutedStyle}>
                                    Applies to: {contract.appliesTo.join(', ') || '—'} · effective{' '}
                                    {contract.effectiveFrom}
                                    {contract.effectiveUntil ? ` → ${contract.effectiveUntil}` : ''}
                                </div>
                                {eventId ? (
                                    <a
                                        style={linkStyle}
                                        href={permalink(space.spaceId, eventId)}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Canonical record: {eventId}
                                    </a>
                                ) : null}
                            </article>
                        ))}
                    </div>
                ))
            )}
        </section>
    );
}

export default SplitContracts;
