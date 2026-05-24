import React, { useCallback, useEffect, useState } from 'react';
import {
    deactivateUser,
    getServerStats,
    listUsers,
    purgeRoom,
    type AdminUser,
    type ServerStats,
} from './adminClient';

const errorMessage = (err: unknown): string => {
    if (err && typeof err === 'object' && 'status' in err) {
        const status = (err as { status?: number }).status;
        if (status === 403) return 'You do not have admin privileges.';
        if (status === 503) return 'Matrix homeserver is not configured.';
    }
    return err instanceof Error ? err.message : 'Request failed.';
};

const sectionStyle: React.CSSProperties = {
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    padding: 16,
    display: 'grid',
    gap: 12,
    background: 'var(--bg-input, #0f172a)',
};

const inputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-surface, #111827)',
    color: 'var(--text-primary, #f8fafc)',
    padding: '8px 10px',
    fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
    borderRadius: 8,
    border: '1px solid var(--border-default, #4b5563)',
    background: 'var(--bg-nav, #1f2937)',
    color: 'var(--text-primary, #f8fafc)',
    padding: '8px 12px',
    fontSize: 13,
    cursor: 'pointer',
};

const dangerButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    borderColor: 'var(--text-critical, #f87171)',
    color: 'var(--text-critical, #f87171)',
};

const StatsPanel = () => {
    const [stats, setStats] = useState<ServerStats | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(() => {
        setLoading(true);
        setError(null);
        getServerStats()
            .then(setStats)
            .catch((err) => setError(errorMessage(err)))
            .finally(() => setLoading(false));
    }, []);

    useEffect(refresh, [refresh]);

    return (
        <section style={sectionStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 16 }}>Server stats</h2>
                <button type="button" style={buttonStyle} onClick={refresh} disabled={loading}>
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>
            {error ? <p style={{ margin: 0, color: 'var(--text-critical, #f87171)' }}>{error}</p> : null}
            {stats ? (
                <div style={{ display: 'flex', gap: 24 }}>
                    <div>
                        <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.totalUsers}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>users</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.totalRooms}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>rooms</div>
                    </div>
                </div>
            ) : null}
        </section>
    );
};

const UsersPanel = () => {
    const [search, setSearch] = useState('');
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const runSearch = useCallback(() => {
        setLoading(true);
        setStatus(null);
        listUsers(search)
            .then((res) => {
                setUsers(res.users);
                setStatus(`${res.users.length} shown of ${res.total} total`);
            })
            .catch((err) => setStatus(errorMessage(err)))
            .finally(() => setLoading(false));
    }, [search]);

    const onDeactivate = (userId: string) => {
        if (!window.confirm(`Deactivate ${userId}? This locks the account.`)) return;
        deactivateUser(userId)
            .then(() => {
                setUsers((prev) =>
                    prev.map((u) => (u.userId === userId ? { ...u, deactivated: true } : u))
                );
                setStatus(`Deactivated ${userId}`);
            })
            .catch((err) => setStatus(errorMessage(err)));
    };

    return (
        <section style={sectionStyle}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Users</h2>
            <div style={{ display: 'flex', gap: 8 }}>
                <input
                    style={inputStyle}
                    value={search}
                    placeholder="Search by name or @user:domain…"
                    aria-label="Search users"
                    onChange={(e) => setSearch(e.currentTarget.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') runSearch();
                    }}
                />
                <button type="button" style={buttonStyle} onClick={runSearch} disabled={loading}>
                    {loading ? 'Searching…' : 'Search'}
                </button>
            </div>
            {status ? <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{status}</p> : null}
            {users.length > 0 ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                    {users.map((user) => (
                        <li
                            key={user.userId}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 12,
                                border: '1px solid var(--border-default, #374151)',
                                borderRadius: 8,
                                padding: '8px 10px',
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 14 }}>{user.displayName ?? user.userId}</div>
                                <div style={{ fontSize: 12, opacity: 0.65 }}>{user.userId}</div>
                            </div>
                            {user.deactivated ? (
                                <span style={{ fontSize: 12, opacity: 0.7 }}>deactivated</span>
                            ) : (
                                <button
                                    type="button"
                                    style={dangerButtonStyle}
                                    onClick={() => onDeactivate(user.userId)}
                                >
                                    Deactivate
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
};

const RoomsPanel = () => {
    const [roomId, setRoomId] = useState('');
    const [status, setStatus] = useState<string | null>(null);
    const [working, setWorking] = useState(false);

    const onPurge = () => {
        const target = roomId.trim();
        if (!target) return;
        if (!window.confirm(`Purge ${target}? This removes the room's history from the server.`)) return;
        setWorking(true);
        setStatus(null);
        purgeRoom(target, { purge: true })
            .then((res) => setStatus(`Purge started${res.deleteId ? ` (job ${res.deleteId})` : ''}.`))
            .catch((err) => setStatus(errorMessage(err)))
            .finally(() => setWorking(false));
    };

    return (
        <section style={sectionStyle}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Rooms</h2>
            <div style={{ display: 'flex', gap: 8 }}>
                <input
                    style={inputStyle}
                    value={roomId}
                    placeholder="!roomid:domain"
                    aria-label="Room id to purge"
                    onChange={(e) => setRoomId(e.currentTarget.value)}
                />
                <button type="button" style={dangerButtonStyle} onClick={onPurge} disabled={working}>
                    {working ? 'Purging…' : 'Purge room'}
                </button>
            </div>
            {status ? <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{status}</p> : null}
        </section>
    );
};

export const PlatformOpsAdminConsole = () => (
    <main style={{ padding: 16, display: 'grid', gap: 16, maxWidth: 720 }}>
        <header>
            <h1 style={{ margin: 0, fontSize: 20 }}>Platform Ops Admin Console</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.75 }}>
                Server operations. All actions are authorized server-side against the admin allowlist.
            </p>
        </header>
        <StatsPanel />
        <UsersPanel />
        <RoomsPanel />
    </main>
);

export default PlatformOpsAdminConsole;
