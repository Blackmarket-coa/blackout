import { useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import {
    DATA_BROKERS,
    generateBrokerRequest,
    type DataBroker,
    type RequesterIdentity,
    type RequestKind,
} from '@blackout/core';
import { dataDeletionAtom, isIdentityComplete, type RequestStatus } from './dataDeletionAtoms';
import { buildMailto, formTarget } from './submissionLinks';
import { privacyToolsEntitledAtom } from '../privacy-tools/privacyToolsAtoms';

const STATUSES: RequestStatus[] = ['pending', 'sent', 'confirmed', 'skipped'];

const copyText = (text: string): void => {
    navigator.clipboard?.writeText(text)?.catch(() => {
        /* clipboard unavailable — user can still copy manually from the text area */
    });
};

export function DataDeletionPanel() {
    const [state, setState] = useAtom(dataDeletionAtom);
    const advancedEntitled = useAtomValue(privacyToolsEntitledAtom);
    const identityReady = isIdentityComplete(state.identity);
    const [copiedAll, setCopiedAll] = useState(false);

    const setIdentity = (patch: Partial<RequesterIdentity>) =>
        setState((prev) => ({ ...prev, identity: { ...prev.identity, ...patch } }));

    const requestFor = (broker: DataBroker) =>
        state.requests[broker.id] ?? {
            kind: 'deletion' as RequestKind,
            status: 'pending' as RequestStatus,
        };

    const updateRequest = (
        brokerId: string,
        patch: Partial<{ kind: RequestKind; status: RequestStatus }>
    ) =>
        setState((prev) => {
            const current = prev.requests[brokerId] ?? { kind: 'deletion', status: 'pending' };
            return {
                ...prev,
                requests: {
                    ...prev.requests,
                    [brokerId]: { ...current, ...patch, updatedAt: new Date().toISOString() },
                },
            };
        });

    const submit = (broker: DataBroker, kind: RequestKind) => {
        const request = generateBrokerRequest(broker, state.identity, kind);
        const mailto = buildMailto(broker, request);
        const form = formTarget(broker);
        if (mailto) {
            copyText(request.body);
            window.open(mailto, '_blank', 'noopener,noreferrer');
        } else if (form) {
            copyText(request.body);
            window.open(form, '_blank', 'noopener,noreferrer');
        }
        updateRequest(broker.id, { kind, status: 'sent' });
    };

    const copyAll = () => {
        const all = DATA_BROKERS.map((broker) => {
            const { kind } = requestFor(broker);
            const r = generateBrokerRequest(broker, state.identity, kind);
            const channel = broker.method === 'email' ? broker.email : broker.optOutUrl;
            return `=== ${broker.name} (${channel}) ===\nSubject: ${r.subject}\n\n${r.body}`;
        }).join('\n\n----------------------------------------\n\n');
        copyText(all);
        setCopiedAll(true);
        window.setTimeout(() => setCopiedAll(false), 2000);
    };

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Data broker deletion</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                Generate GDPR / CCPA deletion and access requests for known data brokers and send
                them yourself. Your details below stay <strong>on this device</strong> —
                they&apos;re only used to fill the request text and are never sent to Blackout.
            </p>

            <div
                style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10 }}
            >
                <strong>Your details</strong>
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                    <input
                        value={state.identity.fullName}
                        onChange={(e) => setIdentity({ fullName: e.target.value })}
                        placeholder="Full name (required)"
                    />
                    <input
                        value={state.identity.email}
                        onChange={(e) => setIdentity({ email: e.target.value })}
                        placeholder="Email (required)"
                        type="email"
                    />
                    <input
                        value={state.identity.phone ?? ''}
                        onChange={(e) => setIdentity({ phone: e.target.value || undefined })}
                        placeholder="Phone (optional)"
                    />
                    <input
                        value={state.identity.addresses?.[0] ?? ''}
                        onChange={(e) =>
                            setIdentity({
                                addresses: e.target.value ? [e.target.value] : undefined,
                            })
                        }
                        placeholder="Address (optional, improves matching)"
                    />
                </div>
                {!identityReady ? (
                    <small style={{ color: 'var(--text-secondary)' }}>
                        Enter at least your name and a valid email to generate requests.
                    </small>
                ) : null}
                <small style={{ color: 'var(--warning, #c96)' }}>
                    This data is stored locally on your device and never sent to Blackout.
                    Consider using the panic wipe to clear it when finished.
                </small>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    type="button"
                    disabled={!identityReady || !advancedEntitled}
                    title={
                        advancedEntitled
                            ? 'Copy every broker request to the clipboard'
                            : 'Bulk export is an advanced privacy feature'
                    }
                    onClick={copyAll}
                >
                    {copiedAll ? 'Copied all' : 'Copy all requests (Advanced)'}
                </button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
                {DATA_BROKERS.map((broker) => {
                    const req = requestFor(broker);
                    return (
                        <div
                            key={broker.id}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 10,
                                padding: 10,
                                display: 'grid',
                                gap: 8,
                            }}
                        >
                            <div
                                style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
                            >
                                <div style={{ display: 'grid' }}>
                                    <strong>{broker.name}</strong>
                                    <small style={{ color: 'var(--text-secondary)' }}>
                                        {broker.jurisdictions.join(', ')} ·{' '}
                                        {broker.method === 'email' ? broker.email : 'opt-out form'}
                                    </small>
                                </div>
                                <select
                                    value={req.status}
                                    onChange={(e) =>
                                        updateRequest(broker.id, {
                                            status: e.target.value as RequestStatus,
                                        })
                                    }
                                    aria-label={`Status for ${broker.name}`}
                                >
                                    {STATUSES.map((s) => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <select
                                    value={req.kind}
                                    onChange={(e) =>
                                        updateRequest(broker.id, {
                                            kind: e.target.value as RequestKind,
                                        })
                                    }
                                    aria-label={`Request type for ${broker.name}`}
                                >
                                    <option value="deletion">Deletion</option>
                                    <option value="access">Access</option>
                                </select>
                                <button
                                    type="button"
                                    disabled={!identityReady}
                                    onClick={() =>
                                        copyText(
                                            generateBrokerRequest(broker, state.identity, req.kind)
                                                .body
                                        )
                                    }
                                >
                                    Copy request
                                </button>
                                <button
                                    type="button"
                                    disabled={!identityReady}
                                    onClick={() => submit(broker, req.kind)}
                                >
                                    {broker.method === 'email' ? 'Open email' : 'Open opt-out form'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export default DataDeletionPanel;
