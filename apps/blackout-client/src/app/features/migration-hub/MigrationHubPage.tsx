import { useCallback, useEffect, useMemo, useState } from 'react';
import * as css from './MigrationHub.css';
import {
    applyImport,
    connectDiscord,
    createBridge,
    deleteBridge,
    fetchDashboard,
    listBridges,
    listImportableGuilds,
    listLinkedAccounts,
    startImport,
    type BridgeActivation,
    type BridgeMode,
    type DiscordGuildSummary,
    type ImportSummary,
    type LinkedAccountSummary,
    type MigrationDashboard,
} from './migrationClient';

const BRIDGE_MODES: BridgeMode[] = ['two-way', 'read-only', 'one-way'];

/**
 * Migration Hub: a single page that walks a Discord community owner through
 * Connect → Import → Activate → Monitor, each panel backed by the
 * /v1/integrations/discord/* API.
 */
export default function MigrationHubPage() {
    const [discord, setDiscord] = useState<LinkedAccountSummary | null>(null);
    const [guilds, setGuilds] = useState<DiscordGuildSummary[]>([]);
    const [bridges, setBridges] = useState<BridgeActivation[]>([]);
    const [importSummaries, setImportSummaries] = useState<Record<string, ImportSummary>>({});
    const [dashboard, setDashboard] = useState<MigrationDashboard | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const refreshBridges = useCallback(async () => {
        try {
            const res = await listBridges();
            setBridges(res.activations);
        } catch {
            /* bridges are optional; ignore load failure */
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { accounts } = await listLinkedAccounts();
                if (cancelled) return;
                const link = accounts.find((a) => a.provider === 'discord') ?? null;
                setDiscord(link);
                if (link) {
                    try {
                        const { guilds: gs } = await listImportableGuilds();
                        if (!cancelled) setGuilds(gs);
                    } catch {
                        /* needs the guilds scope; surfaced inline below */
                    }
                    await refreshBridges();
                }
            } catch {
                if (!cancelled) setError('Could not load your account state.');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [refreshBridges]);

    const onConnect = useCallback(async () => {
        setError(null);
        try {
            const { authorizeUrl } = await connectDiscord();
            window.location.assign(authorizeUrl);
        } catch {
            setError('Could not start the Discord connect flow.');
        }
    }, []);

    const onImport = useCallback(async (guildId: string) => {
        setBusy(`import:${guildId}`);
        setError(null);
        try {
            const { import: record } = await startImport(guildId);
            const applied = await applyImport(record.id);
            setImportSummaries((prev) => ({ ...prev, [guildId]: applied.summary }));
        } catch {
            setError('Import failed. You may need a bot in that server to read its channels.');
        } finally {
            setBusy(null);
        }
    }, []);

    const onLoadDashboard = useCallback(async (guildId: string) => {
        setBusy(`dashboard:${guildId}`);
        try {
            setDashboard(await fetchDashboard(guildId));
        } catch {
            setError('Could not load the adoption dashboard.');
        } finally {
            setBusy(null);
        }
    }, []);

    return (
        <div className={css.Page} data-testid="migration-hub">
            <h1>Migration Hub</h1>
            {error && (
                <div className={css.Muted} data-testid="migration-error" role="alert">
                    {error}
                </div>
            )}

            <ConnectAccounts discord={discord} onConnect={onConnect} />

            <section className={css.Section} data-testid="import-community">
                <div className={css.SectionTitle}>Import community</div>
                {!discord && <div className={css.Muted}>Connect Discord first.</div>}
                {discord && guilds.length === 0 && (
                    <div className={css.Muted}>
                        No importable servers. Re-link Discord with the “guilds” scope.
                    </div>
                )}
                {guilds.map((g) => (
                    <div className={css.Row} key={g.id} data-testid={`guild-${g.id}`}>
                        <div>
                            <div>{g.name}</div>
                            <div className={css.Muted}>
                                {g.owner ? 'Owner' : g.manageable ? 'Manage Server' : 'No access'}
                                {typeof g.approximateMemberCount === 'number'
                                    ? ` · ${g.approximateMemberCount} members`
                                    : ''}
                            </div>
                            {importSummaries[g.id] && (
                                <div className={css.Muted} data-testid={`import-summary-${g.id}`}>
                                    Created {importSummaries[g.id].densCreated} dens,{' '}
                                    {importSummaries[g.id].rolesMapped} role intents
                                    {importSummaries[g.id].degraded ? ' (preview)' : ''}
                                </div>
                            )}
                        </div>
                        <div className={css.Row}>
                            <button
                                type="button"
                                disabled={!g.manageable || busy === `import:${g.id}`}
                                data-testid={`import-${g.id}`}
                                onClick={() => onImport(g.id)}
                            >
                                {busy === `import:${g.id}` ? 'Importing…' : 'Import'}
                            </button>
                            <button
                                type="button"
                                data-testid={`dashboard-${g.id}`}
                                onClick={() => onLoadDashboard(g.id)}
                            >
                                View adoption
                            </button>
                        </div>
                    </div>
                ))}
            </section>

            <ActivateBridge bridges={bridges} onChanged={refreshBridges} setError={setError} />

            <MonitorAdoption dashboard={dashboard} />
        </div>
    );
}

function ConnectAccounts({
    discord,
    onConnect,
}: {
    discord: LinkedAccountSummary | null;
    onConnect: () => void;
}) {
    return (
        <section className={css.Section} data-testid="connect-accounts">
            <div className={css.SectionTitle}>Connect accounts</div>
            <div className={css.Row}>
                <div>
                    Discord
                    {discord && (
                        <span className={css.Muted}>
                            {' '}
                            · linked as {discord.providerUsername ?? discord.providerUserId}
                        </span>
                    )}
                </div>
                {discord ? (
                    <span className={css.Muted} data-testid="discord-linked">
                        Connected
                    </span>
                ) : (
                    <button type="button" data-testid="connect-discord" onClick={onConnect}>
                        Connect Discord
                    </button>
                )}
            </div>
        </section>
    );
}

function ActivateBridge({
    bridges,
    onChanged,
    setError,
}: {
    bridges: BridgeActivation[];
    onChanged: () => void;
    setError: (m: string | null) => void;
}) {
    const [matrixRoomId, setRoom] = useState('');
    const [discordGuildId, setGuild] = useState('');
    const [discordChannelId, setChannel] = useState('');
    const [mode, setMode] = useState<BridgeMode>('two-way');

    const onCreate = useCallback(async () => {
        setError(null);
        try {
            await createBridge({ matrixRoomId, discordGuildId, discordChannelId, mode });
            setRoom('');
            setGuild('');
            setChannel('');
            onChanged();
        } catch {
            setError('Could not activate the bridge. Is the Discord bridge configured?');
        }
    }, [matrixRoomId, discordGuildId, discordChannelId, mode, onChanged, setError]);

    const onRemove = useCallback(
        async (id: string) => {
            try {
                await deleteBridge(id);
                onChanged();
            } catch {
                setError('Could not remove the bridge.');
            }
        },
        [onChanged, setError],
    );

    return (
        <section className={css.Section} data-testid="activate-bridge">
            <div className={css.SectionTitle}>Activate bridge</div>
            {bridges.map((b) => (
                <div className={css.Row} key={b.id} data-testid={`bridge-${b.id}`}>
                    <div className={css.Muted}>
                        {b.matrixRoomId} ↔ #{b.discordChannelId} · {b.mode} · {b.status}
                    </div>
                    <button type="button" data-testid={`bridge-remove-${b.id}`} onClick={() => onRemove(b.id)}>
                        Remove
                    </button>
                </div>
            ))}
            <div className={css.Row}>
                <input
                    aria-label="den room id"
                    placeholder="!den:server"
                    value={matrixRoomId}
                    onChange={(e) => setRoom(e.target.value)}
                />
                <input
                    aria-label="discord guild id"
                    placeholder="guild id"
                    value={discordGuildId}
                    onChange={(e) => setGuild(e.target.value)}
                />
                <input
                    aria-label="discord channel id"
                    placeholder="channel id"
                    value={discordChannelId}
                    onChange={(e) => setChannel(e.target.value)}
                />
                <select
                    aria-label="bridge mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as BridgeMode)}
                >
                    {BRIDGE_MODES.map((m) => (
                        <option key={m} value={m}>
                            {m}
                        </option>
                    ))}
                </select>
                <button type="button" data-testid="bridge-create" onClick={onCreate}>
                    Activate
                </button>
            </div>
        </section>
    );
}

function MonitorAdoption({ dashboard }: { dashboard: MigrationDashboard | null }) {
    const cards = useMemo(() => {
        if (!dashboard) return [];
        const fmt = (m: { value: number | null }) => (m.value === null ? '—' : String(m.value));
        return [
            { label: 'Discord members', value: fmt(dashboard.discordMembers) },
            { label: 'Blackout accounts', value: fmt(dashboard.blackoutAccounts) },
            { label: 'Active bridged users', value: fmt(dashboard.activeBridgedUsers) },
            { label: 'Marketplace participants', value: fmt(dashboard.marketplaceParticipants) },
            { label: 'Imported dens', value: fmt(dashboard.importedDens) },
            { label: 'Bridged channels', value: fmt(dashboard.bridgedChannels) },
        ];
    }, [dashboard]);

    return (
        <section className={css.Section} data-testid="monitor-adoption">
            <div className={css.SectionTitle}>Monitor adoption</div>
            {!dashboard ? (
                <div className={css.Muted}>Pick a server above and choose “View adoption”.</div>
            ) : (
                <div className={css.Cards} data-testid="dashboard-cards">
                    {cards.map((c) => (
                        <div className={css.Card} key={c.label}>
                            <div className={css.CardValue}>{c.value}</div>
                            <div className={css.Muted}>{c.label}</div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
