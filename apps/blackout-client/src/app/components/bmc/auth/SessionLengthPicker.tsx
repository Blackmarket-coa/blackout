import { useEffect, useState, type CSSProperties } from 'react';
import {
    fetchEnforcedSessionLengths,
    isTimedSessionLength,
    SESSION_LENGTH_LABELS,
    SESSION_LENGTHS,
    type PanelSessionChoice,
    type SessionLength,
} from '../../../../client/sessionLength';

/**
 * Which session lengths the servers enforce for this homeserver: `null` while
 * still asking, then the set (empty when either server does not enforce them,
 * leaving only "Until I sign out").
 */
export const useEnforcedSessionLengths = (
    homeserverBaseUrl: string | null
): ReadonlySet<SessionLength> | null => {
    const [enforced, setEnforced] = useState<ReadonlySet<SessionLength> | null>(null);
    useEffect(() => {
        setEnforced(null);
        if (!homeserverBaseUrl) return undefined;
        let cancelled = false;
        void fetchEnforcedSessionLengths(homeserverBaseUrl).then((lengths) => {
            if (!cancelled) setEnforced(lengths);
        });
        return () => {
            cancelled = true;
        };
    }, [homeserverBaseUrl]);
    return enforced;
};

/**
 * A length is offered when it needs no enforcement, or the servers enforce it.
 * Nothing is offered while the servers are still being asked (at most
 * SESSION_LENGTH_REQUEST_TIMEOUT_MS), so a choice can never be made against an
 * answer that is not in yet.
 */
export const isSessionLengthAvailable = (
    length: SessionLength,
    enforced: ReadonlySet<SessionLength> | null
): boolean => enforced !== null && (!isTimedSessionLength(length) || enforced.has(length));

/** The choice to sign in with, or null while nothing (usable) is chosen. */
export const toPanelSessionChoice = (
    length: SessionLength | null,
    enforced: ReadonlySet<SessionLength> | null
): PanelSessionChoice | null => {
    if (length === null || enforced === null) return null;
    if (!isSessionLengthAvailable(length, enforced)) return null;
    return { length, enforcedByServer: enforced.has(length) };
};

const fieldsetStyle: CSSProperties = {
    margin: 0,
    padding: '10px 12px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 8,
    display: 'grid',
    gap: 6,
};

const legendStyle: CSSProperties = {
    padding: '0 4px',
    fontSize: 13,
    fontWeight: 600,
};

const optionStyle = (disabled: boolean, selected: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    padding: '4px 8px',
    borderRadius: 6,
    // The chosen row is marked on its own too, so the choice stays visible
    // whatever the radio itself looks like.
    border: selected ? '1px solid var(--accent, #2563eb)' : '1px solid transparent',
    fontWeight: selected ? 600 : 400,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
});

// index.css resets every `input[type]` to `appearance: none`, which leaves a
// native radio with no size and nothing drawn. Bring the radio back here.
const radioStyle: CSSProperties = {
    appearance: 'auto',
    WebkitAppearance: 'radio',
    width: 16,
    height: 16,
    margin: 0,
    flexShrink: 0,
    accentColor: 'var(--accent, #2563eb)',
};

const helpStyle: CSSProperties = {
    margin: 0,
    fontSize: 12,
    color: 'var(--text-secondary, #94a3b8)',
};

export const SESSION_LENGTH_HELP_ID = 'panel-session-length-help';

type SessionLengthPickerProps = {
    value: SessionLength | null;
    onChange: (next: SessionLength) => void;
    enforced: ReadonlySet<SessionLength> | null;
};

/**
 * Chat panel sign-in (launch-plan B3): how long this sign-in lasts. Nothing is
 * chosen until the person chooses, and signing in stays off until they do.
 *
 * The copy promises only what the servers enforce: a timed length is offered
 * only when both the homeserver and the Blackout API said they end the session
 * on time, even with the panel closed.
 */
export const SessionLengthPicker = ({ value, onChange, enforced }: SessionLengthPickerProps) => {
    const checking = enforced === null;
    const timedAvailable =
        !checking && SESSION_LENGTHS.some((l) => isTimedSessionLength(l) && enforced.has(l));
    return (
        <fieldset
            style={fieldsetStyle}
            data-testid="session-length-picker"
            aria-describedby={SESSION_LENGTH_HELP_ID}
        >
            <legend style={legendStyle}>How long should this panel stay signed in?</legend>
            {SESSION_LENGTHS.map((length) => {
                const disabled = !isSessionLengthAvailable(length, enforced);
                return (
                    <label key={length} style={optionStyle(disabled, value === length)}>
                        <input
                            type="radio"
                            name="panel-session-length"
                            value={length}
                            checked={value === length}
                            disabled={disabled}
                            onChange={() => onChange(length)}
                            style={radioStyle}
                        />
                        {SESSION_LENGTH_LABELS[length]}
                    </label>
                );
            })}
            <p id={SESSION_LENGTH_HELP_ID} style={helpStyle} role="status">
                {checking
                    ? 'Checking which lengths this server can enforce…'
                    : timedAvailable
                    ? 'When the time runs out, you’re signed out on this device. Blackout’s server ends the session then, even if this panel is closed.'
                    : 'This Blackout server can’t end panel sessions on a timer yet, so only “Until I sign out” is available.'}
                {value === 'until_sign_out'
                    ? ' With “Until I sign out”, you stay signed in on this device until you choose Sign out in the panel.'
                    : null}
            </p>
        </fieldset>
    );
};
