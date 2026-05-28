import { useState } from 'react';
import { SENSITIVE_TRACE_PREFIXES, wipeSensitiveTraces, wipeIndexedDB, wipeCookies } from './localTraces';

const CLEARED_SUMMARY = [
    'Unsent message drafts',
    'Burner identity list',
    'Saved steganography passphrases',
    'Data-broker request details',
    'Ephemeral-drop view counts',
    'Per-room reading positions',
    'Local message cache (IndexedDB)',
    'Session cookies + sessionStorage',
];

export function PanicSettings() {
    const [includeSession, setIncludeSession] = useState(false);
    const [armed, setArmed] = useState(false);

    const wipe = () => {
        try {
            wipeSensitiveTraces(window.localStorage, { includeSession });
            wipeSensitiveTraces(window.sessionStorage, { includeSession });
        } catch {
            /* storage may be unavailable */
        }
        Promise.allSettled([
            wipeIndexedDB({ includeSession }),
        ]).finally(() => {
            try { wipeCookies(); } catch { /* best effort */ }
            window.location.reload();
        });
    };

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Panic wipe</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                Immediately clear sensitive data this app stores on <strong>this device</strong>.
                This does not touch messages on the server or other devices — it removes local
                traces only.
            </p>

            <div
                style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10 }}
            >
                <strong>What gets cleared</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                    {CLEARED_SUMMARY.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                    type="checkbox"
                    checked={includeSession}
                    onChange={(e) => setIncludeSession(e.target.checked)}
                />
                Also sign out (clear this device&apos;s session) — you&apos;ll need your credentials
                to sign back in
            </label>

            {!armed ? (
                <button
                    type="button"
                    style={{ color: 'var(--danger, #d33)' }}
                    onClick={() => setArmed(true)}
                >
                    Wipe local traces…
                </button>
            ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                    <strong style={{ color: 'var(--danger, #d33)' }}>
                        This can&apos;t be undone. Continue?
                    </strong>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            type="button"
                            onClick={wipe}
                            style={{ color: 'var(--danger, #d33)' }}
                        >
                            {includeSession ? 'Wipe & sign out' : 'Wipe now'}
                        </button>
                        <button type="button" onClick={() => setArmed(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            <small style={{ color: 'var(--text-secondary)' }}>
                {SENSITIVE_TRACE_PREFIXES.length} categories of local storage are matched and
                removed.
            </small>
        </section>
    );
}

export default PanicSettings;
