import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    filterActiveMutualAidThreads,
    type MutualAidThreadPayload,
    type MutualAidThreadStatus,
    type OpenMutualAidThreadInput,
} from '@blackout/sdk';
import { useRegistryFetcher } from '../../core/features/RegistryFetcherProvider';
// @blackout/ui v1 primitives (Workstream B production adoption). Consumed from
// source so the client's vanilla-extract plugin compiles their `.css.ts`,
// matching MessageComposer's dogfood import.
import {
    Button,
    Card,
    Checkbox,
    Input,
    Stack,
    TextArea,
} from '@blackout/ui/primitives';

export type MutualAidFetcher = {
    listThreads: () => Promise<{ threads: MutualAidThreadPayload[] }>;
    openThread: (input: OpenMutualAidThreadInput) => Promise<unknown>;
    updateThreadStatus: (
        threadId: string,
        status: MutualAidThreadStatus
    ) => Promise<unknown>;
};

type Props = {
    fetcher?: MutualAidFetcher;
    /** Optional toggle for showing resolved/cancelled threads. Defaults to `false`. */
    showInactive?: boolean;
};

const stub: MutualAidFetcher = {
    listThreads: async () => ({ threads: [] }),
    openThread: async () => ({}),
    updateThreadStatus: async () => ({}),
};

const STATUSES: MutualAidThreadStatus[] = ['open', 'in_progress', 'resolved', 'cancelled'];

export function MutualAidPage({ fetcher: explicitFetcher, showInactive = false }: Props) {
    const contextFetcher = useRegistryFetcher('mutualAid');
    const fetcher = explicitFetcher ?? contextFetcher ?? stub;
    const [threads, setThreads] = useState<MutualAidThreadPayload[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const [headline, setHeadline] = useState('');
    const [body, setBody] = useState('');
    const [includeInactive, setIncludeInactive] = useState(showInactive);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const response = await fetcher.listThreads();
            setThreads(response.threads ?? []);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Failed to load threads.');
        }
    }, [fetcher]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onOpen = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const trimmed = headline.trim();
            if (!trimmed) {
                setActionError('Headline is required.');
                return;
            }
            setActionError(null);
            setPending('open');
            try {
                await fetcher.openThread({
                    headline: trimmed,
                    ...(body.trim() ? { body: body.trim() } : {}),
                });
                setHeadline('');
                setBody('');
                await refresh();
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : 'Failed to open thread.'
                );
            } finally {
                setPending(null);
            }
        },
        [body, fetcher, headline, refresh]
    );

    const onUpdateStatus = useCallback(
        async (threadId: string, status: MutualAidThreadStatus) => {
            setActionError(null);
            setPending(threadId);
            try {
                await fetcher.updateThreadStatus(threadId, status);
                await refresh();
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : `Failed to update ${threadId}.`
                );
            } finally {
                setPending(null);
            }
        },
        [fetcher, refresh]
    );

    const visible = useMemo(
        () => (includeInactive ? threads : filterActiveMutualAidThreads(threads)),
        [includeInactive, threads]
    );

    return (
        <main
            data-testid="mutual-aid-page"
            style={{ padding: 16, display: 'grid', gap: 16 }}
        >
            <header>
                <h1 style={{ margin: 0 }}>Mutual aid</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Open requests + helper threads. Mirrors `_port`'s `/blackout/mutual-aid`
                    route, on top of the deaddrop infrastructure.
                </p>
            </header>

            {loadError ? (
                <p data-testid="mutual-aid-load-error" role="alert">
                    {loadError}
                </p>
            ) : null}
            {actionError ? (
                <p data-testid="mutual-aid-action-error" role="alert">
                    {actionError}
                </p>
            ) : null}

            <form data-testid="mutual-aid-open-form" onSubmit={onOpen}>
                <Card>
                    <Stack direction="column" gap={6}>
                        <strong>Open a request</strong>
                        <label>
                            Headline
                            <Input
                                data-testid="mutual-aid-headline"
                                value={headline}
                                onChange={(event) => setHeadline(event.target.value)}
                            />
                        </label>
                        <label>
                            Body (optional)
                            <TextArea
                                data-testid="mutual-aid-body"
                                value={body}
                                onChange={(event) => setBody(event.target.value)}
                                rows={3}
                            />
                        </label>
                        <Button
                            type="submit"
                            data-testid="mutual-aid-open-submit"
                            loading={pending === 'open'}
                        >
                            {pending === 'open' ? 'Opening…' : 'Open request'}
                        </Button>
                    </Stack>
                </Card>
            </form>

            <Checkbox
                data-testid="mutual-aid-toggle-inactive"
                label="Show resolved + cancelled threads"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
            />

            {visible.length === 0 ? (
                <p
                    data-testid="mutual-aid-empty"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    No mutual-aid threads to show.
                </p>
            ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                    {visible.map((thread) => (
                        <li
                            key={thread.threadId}
                            data-testid={`mutual-aid-thread-${thread.threadId}`}
                            data-status={thread.status}
                        >
                            <Card>
                                <Stack direction="column" gap={4}>
                                    <Stack direction="row" justify="space-between">
                                        <strong>{thread.headline}</strong>
                                        <small>{thread.status}</small>
                                    </Stack>
                                    <small style={{ color: 'var(--text-secondary)' }}>
                                        requester: {thread.requester} · opened {thread.openedAt}
                                    </small>
                                    {thread.body ? <p style={{ margin: 0 }}>{thread.body}</p> : null}
                                    <Stack direction="row" gap={6} wrap>
                                        {STATUSES.filter((status) => status !== thread.status).map(
                                            (status) => (
                                                <Button
                                                    key={status}
                                                    tone="neutral"
                                                    size="sm"
                                                    data-testid={`mutual-aid-status-${thread.threadId}-${status}`}
                                                    onClick={() =>
                                                        void onUpdateStatus(thread.threadId, status)
                                                    }
                                                    disabled={pending === thread.threadId}
                                                >
                                                    Mark {status}
                                                </Button>
                                            )
                                        )}
                                    </Stack>
                                </Stack>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}

export default MutualAidPage;
