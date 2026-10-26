import { useState } from 'react';
import {
    type KeyValueStore,
    SENSITIVE_TRACE_PREFIXES,
    SESSION_PREFIXES,
    wipeSensitiveTraces,
} from './localTraces';

type SensitiveTracePrefix = typeof SENSITIVE_TRACE_PREFIXES[number];
type SessionPrefix = typeof SESSION_PREFIXES[number];

/**
 * What the wipe removes, one line per localStorage prefix in `localTraces.ts`.
 * Keyed by prefix so that a prefix added there cannot reach the screen without
 * a line saying what it is.
 */
export const PANIC_REMOVES: Record<SensitiveTracePrefix, string> = {
    'blackout.draft.': 'Unsent message drafts',
    'blackout.burners.': 'The list of burner identities made on this device',
    'blackout.burner.primary': 'Which account to go back to from a burner identity',
    'blackout.settings.steganography': 'Saved steganography passphrases and settings',
    'blackout.settings.data-deletion':
        'The name and email kept for data-broker deletion requests, and each request’s status',
    'blackout.ephemeral.': 'How many times this device opened each ephemeral drop',
    'blackout.timeline.scroll': 'Where you stopped reading in each room',
};

/** What the sign-in option removes as well, one line per prefix. */
export const PANIC_SIGN_IN_REMOVES: Record<SessionPrefix, string> = {
    'blackout.matrix.sessions':
        'The stored sign-in of every account on this device, burner identities included',
    'blackout.api.token': 'This device’s Blackout API token',
};

export const PANIC_INTRO =
    'Removes the items under “What gets removed” from this app’s storage on this device. ' +
    'It does not remove everything the app keeps here: “What stays” lists the rest. ' +
    'Nothing on the server or on your other devices changes.';

export const PANIC_SIGN_IN_OPTION = 'Also forget this device’s sign-ins';

export const PANIC_SIGN_IN_DETAIL =
    'The app then opens on the sign-in screen, and you need your credentials to sign back in. ' +
    'The homeserver is not told: those sessions are not ended there, and they stay on your ' +
    'account’s list of sessions until they are signed out from another Matrix client.';

/** What the wipe leaves on this device, whichever options are chosen. */
export const PANIC_KEEPS: readonly string[] = [
    'Your sign-ins, unless you tick “' + PANIC_SIGN_IN_OPTION + '” below.',
    'This device’s copy of your rooms and recent messages, and the encryption keys that ' +
        'decrypt your messages. The Matrix client keeps them in the browser’s database ' +
        '(IndexedDB), and the wipe leaves them there even with the box ticked.',
    'Original videos saved in this device’s video vault.',
    'Everything else the app keeps in this browser, such as your settings, per-room ' +
        'notification choices, recent reactions and GIFs, and the homeservers you used.',
    'The browser’s own history, cache and downloads.',
];

export const PANIC_NOT_FORENSIC =
    'This is not a forensic wipe: the browser deletes the entries, but their data may stay ' +
    'on the disk.';

export interface PanicSettingsProps {
    /** Where the wipe runs; the page's localStorage unless a test passes one. */
    storage?: KeyValueStore;
    /** Called after the wipe; reloads the page unless a test passes one. */
    reload?: () => void;
}

export function PanicSettings({ storage, reload }: PanicSettingsProps = {}) {
    const [includeSession, setIncludeSession] = useState(false);
    const [armed, setArmed] = useState(false);

    const wipe = () => {
        try {
            wipeSensitiveTraces(storage ?? window.localStorage, { includeSession });
        } finally {
            // Reload so in-memory state (jotai atoms) is rebuilt from the now-cleared
            // storage; if the sign-ins were removed this lands on the sign-in screen.
            (reload ?? (() => window.location.reload()))();
        }
    };

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Panic wipe</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>{PANIC_INTRO}</p>

            <div
                style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10 }}
            >
                <strong>What gets removed</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                    {Object.values(PANIC_REMOVES).map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                    {includeSession
                        ? Object.values(PANIC_SIGN_IN_REMOVES).map((item) => (
                              <li key={item}>{item}</li>
                          ))
                        : null}
                </ul>
            </div>

            <div
                style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10 }}
            >
                <strong>What stays on this device</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                    {PANIC_KEEPS.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <input
                    type="checkbox"
                    checked={includeSession}
                    onChange={(e) => setIncludeSession(e.target.checked)}
                />
                <span>
                    {PANIC_SIGN_IN_OPTION}. {PANIC_SIGN_IN_DETAIL}
                </span>
            </label>

            {!armed ? (
                <button
                    type="button"
                    style={{ color: 'var(--danger, #d33)' }}
                    onClick={() => setArmed(true)}
                >
                    Wipe the items listed…
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
                            {includeSession ? 'Wipe and forget sign-ins' : 'Wipe now'}
                        </button>
                        <button type="button" onClick={() => setArmed(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            <small style={{ color: 'var(--text-secondary)' }}>{PANIC_NOT_FORENSIC}</small>
        </section>
    );
}

export default PanicSettings;
