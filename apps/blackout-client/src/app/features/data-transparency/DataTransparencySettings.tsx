import { useMemo } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useDeviceList } from '../../hooks/useDeviceList';
import { useTransparencyFeatures } from './useTransparencyFeatures';

type DataTransparencySettingsProps = {
    requestClose?: () => void;
};

const formatTs = (ts?: number): string =>
    typeof ts === 'number' && Number.isFinite(ts) ? new Date(ts).toLocaleString() : 'unknown';

const sectionStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    padding: 10,
};

/** Enumerate the Blackout-owned localStorage keys so users can see what's
 * persisted on this device. Best-effort: skips access errors (private mode). */
const readLocalKeys = (): Array<{ key: string; bytes: number }> => {
    try {
        const out: Array<{ key: string; bytes: number }> = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('blackout.')) continue;
            const value = localStorage.getItem(key) ?? '';
            out.push({ key, bytes: value.length });
        }
        return out.sort((a, b) => a.key.localeCompare(b.key));
    } catch {
        return [];
    }
};

export function DataTransparencySettings({ requestClose }: DataTransparencySettingsProps = {}) {
    const mx = useMatrixClient();
    const [devices, refreshDevices] = useDeviceList();

    const userId = mx.getUserId() ?? 'unknown';
    const deviceId = mx.getDeviceId() ?? 'unknown';
    const homeserver = mx.getHomeserverUrl();

    const roomStats = useMemo(() => {
        const rooms = mx.getRooms();
        let joinedRooms = 0;
        let joinedSpaces = 0;
        let invites = 0;
        for (const room of rooms) {
            const membership = room.getMyMembership();
            const isSpace = room.isSpaceRoom();
            if (membership === 'invite') invites += 1;
            else if (membership === 'join') {
                if (isSpace) joinedSpaces += 1;
                else joinedRooms += 1;
            }
        }
        return { joinedRooms, joinedSpaces, invites, total: rooms.length };
    }, [mx]);

    const localKeys = useMemo(() => readLocalKeys(), []);
    const transparency = useTransparencyFeatures();

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>What&apos;s stored about me</h3>
                {requestClose ? (
                    <button type="button" onClick={requestClose}>
                        Close
                    </button>
                ) : null}
            </div>

            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                A summary of the account metadata your homeserver retains and the data Blackout
                keeps on this device. Everything here is read directly from your own session.
            </p>

            <div style={sectionStyle} data-testid="feature-toggle-transparency-reports">
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={transparency.selfReport} disabled readOnly />
                    <strong>Self-service transparency</strong>
                </label>
                <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                    The self-report below and the warrant canary are always available on your plan (
                    {transparency.tier}). Org-scoped audit export
                    {transparency.auditExport
                        ? ' is enabled.'
                        : ' requires the Team tier or higher.'}
                </p>
                <button
                    type="button"
                    style={{ marginTop: 8 }}
                    disabled={!transparency.auditExport}
                    data-testid="transparency-audit-export"
                >
                    {transparency.auditExport ? 'Export my audit record' : 'Audit export (Team)'}
                </button>
            </div>

            <div style={sectionStyle}>
                <strong>Account &amp; homeserver</strong>
                <dl
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'max-content 1fr',
                        gap: '4px 12px',
                        margin: '8px 0 0',
                    }}
                >
                    <dt style={{ color: 'var(--text-secondary)' }}>User ID</dt>
                    <dd style={{ margin: 0, wordBreak: 'break-all' }}>{userId}</dd>
                    <dt style={{ color: 'var(--text-secondary)' }}>Homeserver</dt>
                    <dd style={{ margin: 0, wordBreak: 'break-all' }}>{homeserver}</dd>
                    <dt style={{ color: 'var(--text-secondary)' }}>This device</dt>
                    <dd style={{ margin: 0, wordBreak: 'break-all' }}>{deviceId}</dd>
                </dl>
            </div>

            <div style={sectionStyle}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <strong>Sessions / devices</strong>
                    <button type="button" onClick={() => void refreshDevices()}>
                        Refresh
                    </button>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    {devices === undefined ? (
                        <small>Loading sessions…</small>
                    ) : devices.length === 0 ? (
                        <small>No sessions reported.</small>
                    ) : (
                        devices.map((device) => (
                            <div
                                key={device.device_id}
                                style={{
                                    display: 'grid',
                                    gap: 2,
                                    borderTop: '1px solid var(--border-default)',
                                    paddingTop: 6,
                                }}
                            >
                                <span>
                                    {device.display_name || device.device_id}
                                    {device.device_id === deviceId ? ' (this device)' : ''}
                                </span>
                                <small style={{ color: 'var(--text-secondary)' }}>
                                    {device.device_id} · last seen {formatTs(device.last_seen_ts)}
                                    {device.last_seen_ip ? ` · ${device.last_seen_ip}` : ''}
                                </small>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div style={sectionStyle}>
                <strong>Rooms &amp; spaces</strong>
                <dl
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'max-content 1fr',
                        gap: '4px 12px',
                        margin: '8px 0 0',
                    }}
                >
                    <dt style={{ color: 'var(--text-secondary)' }}>Joined rooms</dt>
                    <dd style={{ margin: 0 }}>{roomStats.joinedRooms}</dd>
                    <dt style={{ color: 'var(--text-secondary)' }}>Joined spaces</dt>
                    <dd style={{ margin: 0 }}>{roomStats.joinedSpaces}</dd>
                    <dt style={{ color: 'var(--text-secondary)' }}>Pending invites</dt>
                    <dd style={{ margin: 0 }}>{roomStats.invites}</dd>
                </dl>
            </div>

            <div style={sectionStyle}>
                <strong>Stored on this device</strong>
                <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                    {localKeys.length === 0 ? (
                        <small>No Blackout data found in local storage.</small>
                    ) : (
                        localKeys.map((entry) => (
                            <div
                                key={entry.key}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                }}
                            >
                                <span style={{ wordBreak: 'break-all' }}>{entry.key}</span>
                                <small
                                    style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                                >
                                    {entry.bytes.toLocaleString()} chars
                                </small>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </section>
    );
}

export default DataTransparencySettings;
