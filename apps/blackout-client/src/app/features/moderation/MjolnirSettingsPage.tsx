import React, { useCallback, useEffect, useState } from 'react';
import {
    classifyBanListEntity,
    type AddBanListRuleInput,
    type BanListSnapshot,
    type ProtectionDescriptor,
} from '@blackout/sdk';
import { useRegistryFetcher } from '../../core/features/RegistryFetcherProvider';

export type MjolnirFetcher = {
    listBanLists: () => Promise<{ lists: BanListSnapshot[] }>;
    addBanListRule: (listId: string, input: AddBanListRuleInput) => Promise<unknown>;
    removeBanListRule: (listId: string, ruleId: string) => Promise<unknown>;
    listProtections: () => Promise<{ protections: ProtectionDescriptor[] }>;
    setProtectionEnabled: (
        protectionId: string,
        enabled: boolean,
        settings?: Record<string, string | number | boolean>
    ) => Promise<unknown>;
};

type Props = {
    fetcher?: MjolnirFetcher;
};

const stub: MjolnirFetcher = {
    listBanLists: async () => ({ lists: [] }),
    addBanListRule: async () => ({}),
    removeBanListRule: async () => ({}),
    listProtections: async () => ({ protections: [] }),
    setProtectionEnabled: async () => ({}),
};

export function MjolnirSettingsPage({ fetcher: explicitFetcher }: Props) {
    const contextFetcher = useRegistryFetcher('mjolnir');
    const fetcher = explicitFetcher ?? contextFetcher ?? stub;
    const [lists, setLists] = useState<BanListSnapshot[]>([]);
    const [protections, setProtections] = useState<ProtectionDescriptor[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [activeListId, setActiveListId] = useState<string>('');
    const [entity, setEntity] = useState('');
    const [reason, setReason] = useState('Blackmarket community guidelines violation');

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const [banlistResponse, protectionResponse] = await Promise.all([
                fetcher.listBanLists(),
                fetcher.listProtections(),
            ]);
            setLists(banlistResponse.lists ?? []);
            setProtections(protectionResponse.protections ?? []);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Failed to load mjolnir state.');
        }
    }, [fetcher]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // Auto-select the first list once lists are loaded; standalone effect so
    // setting activeListId doesn't invalidate `refresh` and trigger a reload.
    useEffect(() => {
        if (!activeListId && lists.length > 0) {
            setActiveListId(lists[0].listId);
        }
    }, [activeListId, lists]);

    const onAddRule = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setActionError(null);
            const trimmed = entity.trim();
            const kind = classifyBanListEntity(trimmed);
            if (!activeListId || !kind) {
                setActionError('Pick a list and enter a non-empty entity.');
                return;
            }
            setPending(true);
            try {
                await fetcher.addBanListRule(activeListId, {
                    kind,
                    entity: trimmed,
                    reason: reason.trim() || 'No reason provided',
                });
                setEntity('');
                await refresh();
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : 'Failed to add rule.'
                );
            } finally {
                setPending(false);
            }
        },
        [activeListId, entity, fetcher, reason, refresh]
    );

    const onRemoveRule = useCallback(
        async (listId: string, ruleId: string) => {
            setActionError(null);
            setPending(true);
            try {
                await fetcher.removeBanListRule(listId, ruleId);
                await refresh();
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : 'Failed to remove rule.'
                );
            } finally {
                setPending(false);
            }
        },
        [fetcher, refresh]
    );

    const onToggleProtection = useCallback(
        async (protection: ProtectionDescriptor) => {
            setActionError(null);
            setPending(true);
            try {
                await fetcher.setProtectionEnabled(protection.id, !protection.enabled);
                await refresh();
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : 'Failed to toggle protection.'
                );
            } finally {
                setPending(false);
            }
        },
        [fetcher, refresh]
    );

    const activeList = lists.find((list) => list.listId === activeListId) ?? null;

    return (
        <main
            data-testid="mjolnir-settings-page"
            style={{ padding: 16, display: 'grid', gap: 16 }}
        >
            <header>
                <h1 style={{ margin: 0 }}>Mjolnir moderation</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    {
                        'Personal banlist rules + protection toggles. Backed by the BKL-009 mjolnir SDK and the `blackout.moderation.mjolnir.banlist.changed` / `blackout.moderation.mjolnir.protection.changed` events.'
                    }
                </p>
            </header>

            {loadError ? (
                <p data-testid="mjolnir-load-error" role="alert">
                    {loadError}
                </p>
            ) : null}
            {actionError ? (
                <p data-testid="mjolnir-action-error" role="alert">
                    {actionError}
                </p>
            ) : null}

            <section
                data-testid="mjolnir-banlists"
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                }}
            >
                <header style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>Banlists</strong>
                    <button type="button" onClick={() => void refresh()}>
                        Refresh
                    </button>
                </header>

                {lists.length === 0 ? (
                    <p data-testid="mjolnir-banlists-empty" style={{ color: 'var(--text-secondary)' }}>
                        No banlists subscribed yet.
                    </p>
                ) : (
                    <>
                        <label style={{ display: 'grid', gap: 4 }}>
                            Active list
                            <select
                                data-testid="mjolnir-active-list"
                                value={activeListId}
                                onChange={(event) => setActiveListId(event.target.value)}
                            >
                                {lists.map((list) => (
                                    <option key={list.listId} value={list.listId}>
                                        {list.label}
                                        {list.subscribed ? '' : ' (unsubscribed)'}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <form
                            data-testid="mjolnir-add-rule-form"
                            onSubmit={onAddRule}
                            style={{ display: 'grid', gap: 4 }}
                        >
                            <label>
                                Entity (`@user:srv`, `!room:srv`, or server glob)
                                <input
                                    data-testid="mjolnir-entity-input"
                                    value={entity}
                                    onChange={(event) => setEntity(event.target.value)}
                                />
                            </label>
                            <label>
                                Reason
                                <input
                                    data-testid="mjolnir-reason-input"
                                    value={reason}
                                    onChange={(event) => setReason(event.target.value)}
                                />
                            </label>
                            <button
                                type="submit"
                                data-testid="mjolnir-add-rule-submit"
                                disabled={pending}
                            >
                                {pending ? 'Adding…' : 'Add rule'}
                            </button>
                        </form>

                        {activeList ? (
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                                {activeList.rules.length === 0 ? (
                                    <li
                                        data-testid="mjolnir-rules-empty"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        No rules in this list.
                                    </li>
                                ) : (
                                    activeList.rules.map((rule) => (
                                        <li
                                            key={rule.ruleId}
                                            data-testid={`mjolnir-rule-${rule.ruleId}`}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                gap: 6,
                                                padding: '4px 0',
                                            }}
                                        >
                                            <span>
                                                <strong>{rule.kind}</strong> · {rule.entity} ·{' '}
                                                <small>{rule.reason}</small>
                                            </span>
                                            <button
                                                type="button"
                                                data-testid={`mjolnir-remove-rule-${rule.ruleId}`}
                                                onClick={() =>
                                                    void onRemoveRule(activeList.listId, rule.ruleId)
                                                }
                                                disabled={pending}
                                            >
                                                Remove
                                            </button>
                                        </li>
                                    ))
                                )}
                            </ul>
                        ) : null}
                    </>
                )}
            </section>

            <section
                data-testid="mjolnir-protections"
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                }}
            >
                <strong>Protections</strong>
                {protections.length === 0 ? (
                    <p data-testid="mjolnir-protections-empty" style={{ color: 'var(--text-secondary)' }}>
                        No protections configured.
                    </p>
                ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                        {protections.map((protection) => (
                            <li
                                key={protection.id}
                                data-testid={`mjolnir-protection-${protection.id}`}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 6,
                                    padding: '4px 0',
                                }}
                            >
                                <span>{protection.label}</span>
                                <button
                                    type="button"
                                    data-testid={`mjolnir-toggle-${protection.id}`}
                                    onClick={() => void onToggleProtection(protection)}
                                    disabled={pending}
                                >
                                    {protection.enabled ? 'Disable' : 'Enable'}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}

export default MjolnirSettingsPage;
