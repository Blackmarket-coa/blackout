import React, { useEffect, useMemo, useState } from 'react';
import { autoDiscovery, publicRooms } from '../../cs-api';
import { loadClientConfig, defaultHomeserverFromConfig } from '../../components/bmc/auth/homeserver';

/**
 * Standalone, unauthenticated public room directory.
 *
 * Rendered by `BootstrapStatus` for logged-out visitors hitting `/explore`,
 * so contributors can browse the community before creating an account. It does
 * NOT use the authed Matrix client (none exists pre-login) — it resolves the
 * configured homeserver via `.well-known` discovery and calls the unauthenticated
 * `GET /_matrix/client/v3/publicRooms` endpoint directly.
 *
 * This only returns rooms when the homeserver opts in with
 * `allow_public_rooms_without_auth: true`; otherwise the server answers 401/403
 * and we fall back to a "sign in to browse" prompt. Joining always routes
 * through sign-in since there's no session to join with.
 */

type PublicRoom = {
  roomId: string;
  name: string;
  topic?: string;
  alias?: string;
  members: number;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; rooms: PublicRoom[] }
  | { kind: 'auth_required' }
  | { kind: 'error'; message: string };

const fetchPublicRooms = async (): Promise<LoadState> => {
  const config = await loadClientConfig();
  const host = defaultHomeserverFromConfig(config);

  const [discoveryError, info] = await autoDiscovery(fetch, host);
  if (discoveryError || !info) {
    return { kind: 'error', message: `Could not reach the homeserver "${host}".` };
  }
  const baseUrl = info['m.homeserver'].base_url;

  let result: Awaited<ReturnType<typeof publicRooms>>;
  try {
    result = await publicRooms(fetch, baseUrl);
  } catch {
    return { kind: 'error', message: 'Could not load public rooms. Check your connection and try again.' };
  }

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      return { kind: 'auth_required' };
    }
    return { kind: 'error', message: `Failed to load public rooms (HTTP ${result.status}).` };
  }

  const rooms: PublicRoom[] = result.chunk.map((room) => {
    const roomId = String(room.room_id ?? '');
    const alias = typeof room.canonical_alias === 'string' ? room.canonical_alias : undefined;
    return {
      roomId,
      name: String(room.name ?? alias ?? roomId),
      topic: typeof room.topic === 'string' ? room.topic : undefined,
      alias,
      members: Number(room.num_joined_members ?? 0),
    };
  });
  rooms.sort((a, b) => b.members - a.members);
  return { kind: 'ready', rooms };
};

const cardStyle: React.CSSProperties = {
  width: 'min(720px, 100%)',
  border: '1px solid var(--border-default, #374151)',
  borderRadius: 12,
  background: 'var(--bg-input, #0f172a)',
  padding: 20,
  display: 'grid',
  gap: 12,
};

const signInLink: React.CSSProperties = {
  width: 'fit-content',
  borderRadius: 8,
  border: '1px solid var(--border-default, #4b5563)',
  background: 'var(--bg-nav, #1f2937)',
  color: 'var(--text-primary, #f8fafc)',
  padding: '8px 12px',
  cursor: 'pointer',
  textDecoration: 'none',
};

export const PublicDirectory = () => {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchPublicRooms().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleRooms = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return state.rooms;
    return state.rooms.filter(
      (room) =>
        room.name.toLowerCase().includes(needle) ||
        (room.alias ?? '').toLowerCase().includes(needle) ||
        (room.topic ?? '').toLowerCase().includes(needle)
    );
  }, [state, search]);

  return (
    <main
      data-shell="public-directory"
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        placeItems: 'center',
        background: 'var(--bg-surface, #111827)',
        color: 'var(--text-primary, #f8fafc)',
        padding: 24,
        gap: 16,
      }}
    >
      <section style={cardStyle}>
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Browse public rooms</h1>
          <a href="/login" style={signInLink}>
            Sign in
          </a>
        </header>
        <p style={{ margin: 0, opacity: 0.85, fontSize: 14 }}>
          Explore the community before you join. Sign in or create an account to participate.
        </p>

        {state.kind === 'ready' ? (
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search rooms…"
            aria-label="Search public rooms"
            style={{
              width: '100%',
              borderRadius: 8,
              border: '1px solid var(--border-default, #374151)',
              background: 'var(--bg-surface, #111827)',
              color: 'var(--text-primary, #f8fafc)',
              padding: '8px 10px',
              fontSize: 14,
            }}
          />
        ) : null}

        {state.kind === 'loading' ? <p style={{ margin: 0 }}>Loading public rooms…</p> : null}

        {state.kind === 'auth_required' ? (
          <p style={{ margin: 0, opacity: 0.9 }}>
            This homeserver requires you to sign in before browsing its public rooms.{' '}
            <a href="/login" style={{ color: 'var(--accent-primary, #60a5fa)' }}>
              Sign in to continue.
            </a>
          </p>
        ) : null}

        {state.kind === 'error' ? (
          <p style={{ margin: 0, color: 'var(--text-critical, #f87171)' }}>{state.message}</p>
        ) : null}

        {state.kind === 'ready' && visibleRooms.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.85 }}>No public rooms found.</p>
        ) : null}

        {state.kind === 'ready' && visibleRooms.length > 0 ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {visibleRooms.map((room) => (
              <li
                key={room.roomId}
                style={{
                  border: '1px solid var(--border-default, #374151)',
                  borderRadius: 8,
                  padding: 12,
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 15 }}>{room.name}</strong>
                  <span style={{ fontSize: 12, opacity: 0.7, whiteSpace: 'nowrap' }}>{room.members} members</span>
                </div>
                {room.alias ? <div style={{ fontSize: 12, opacity: 0.65 }}>{room.alias}</div> : null}
                {room.topic ? (
                  <div style={{ fontSize: 13, opacity: 0.85 }}>{room.topic}</div>
                ) : null}
                <a
                  href="/login"
                  style={{ ...signInLink, marginTop: 4, fontSize: 13 }}
                >
                  Sign in to join
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
};

export default PublicDirectory;
