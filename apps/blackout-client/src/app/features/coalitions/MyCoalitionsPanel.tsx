import React, { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { COALITION_ROLE_LABELS } from '@blackout/core';
import {
    fetchCoalitions,
    joinCoalition,
    withdrawJoinRequest,
    type CoalitionSummary,
} from './coalitionsClient';
import { useCoalitionInvites } from './useCoalitionInvites';
import {
    buttonStyle,
    mutedStyle,
    nameStyle,
    roleChipStyle,
    rowStyle,
    sectionLabelStyle,
} from './coalitionsStyles';

export interface MyCoalitionsPanelProps {
    /** Called once a link has navigated away (dialogs close themselves). */
    onNavigatedAway?: () => void;
}

/**
 * The compact "my coalitions" body: invitations waiting on you (accept /
 * decline), then the coalitions you belong to with your role in each. Chrome-
 * free so it renders both inside {@link CoalitionsDialog} and as the canopies
 * hub tab that replaced Friends.
 */
export const MyCoalitionsPanel = ({ onNavigatedAway }: MyCoalitionsPanelProps) => {
    const { invites, refresh } = useCoalitionInvites();
    const [mine, setMine] = useState<CoalitionSummary[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);

    const loadMine = async () => {
        try {
            setMine(await fetchCoalitions({ mine: true }));
        } catch {
            setMine([]);
        } finally {
            setLoaded(true);
        }
    };

    useEffect(() => {
        void loadMine();
    }, []);

    const run = async (fn: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
        } finally {
            setBusy(false);
        }
    };

    const Section = ({ label, children }: { label: string; children: ReactNode }) => (
        <>
            <div style={sectionLabelStyle}>{label}</div>
            {children}
        </>
    );

    return (
        <div data-testid="my-coalitions-panel">
            {invites.length > 0 ? (
                <Section label={`Invitations — ${invites.length}`}>
                    {invites.map(({ request, coalition, invitedBy }) => (
                        <div key={request.id} style={rowStyle} data-testid="coalition-invite">
                            <span style={nameStyle} title={coalition.mission}>
                                {coalition.name}
                                {invitedBy ? (
                                    <span style={{ ...mutedStyle, marginLeft: 6 }}>
                                        from {invitedBy.username}
                                    </span>
                                ) : null}
                            </span>
                            <button
                                type="button"
                                style={buttonStyle('primary')}
                                disabled={busy}
                                data-testid="coalition-invite-accept"
                                onClick={() =>
                                    void run(async () => {
                                        await joinCoalition(coalition.id);
                                        await Promise.all([refresh(), loadMine()]);
                                    })
                                }
                            >
                                Accept
                            </button>
                            <button
                                type="button"
                                style={buttonStyle('danger')}
                                disabled={busy}
                                data-testid="coalition-invite-decline"
                                onClick={() =>
                                    void run(async () => {
                                        await withdrawJoinRequest(coalition.id);
                                        await refresh();
                                    })
                                }
                            >
                                Decline
                            </button>
                        </div>
                    ))}
                </Section>
            ) : null}

            <Section label={`Your coalitions — ${mine.length}`}>
                {!loaded ? (
                    <span style={mutedStyle}>Loading…</span>
                ) : mine.length === 0 ? (
                    <span style={mutedStyle} data-testid="my-coalitions-empty">
                        You are not in any coalitions yet.{' '}
                        <Link to="/coalitions" onClick={onNavigatedAway}>
                            Find one or found your own.
                        </Link>
                    </span>
                ) : (
                    mine.map((row) => (
                        <div key={row.coalition.id} style={rowStyle} data-testid="my-coalition-row">
                            <Link
                                to={`/coalitions/${encodeURIComponent(row.coalition.slug)}`}
                                style={{ ...nameStyle, color: 'inherit', textDecoration: 'none' }}
                                onClick={onNavigatedAway}
                            >
                                {row.coalition.name}
                            </Link>
                            {row.viewerRole ? (
                                <span style={roleChipStyle}>
                                    {COALITION_ROLE_LABELS[row.viewerRole]}
                                </span>
                            ) : null}
                            <span style={mutedStyle}>
                                {row.memberCount} · {row.activeCampaigns} active
                            </span>
                        </div>
                    ))
                )}
            </Section>

            <div style={{ padding: '12px 4px 0' }}>
                <Link to="/coalitions" style={buttonStyle('subtle')} onClick={onNavigatedAway}>
                    Browse all coalitions
                </Link>
            </div>
        </div>
    );
};

export default MyCoalitionsPanel;
