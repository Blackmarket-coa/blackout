import { useEffect, useState, type CSSProperties } from 'react';
import {
    fetchCoalitions,
    inviteToCoalition,
    type CoalitionSummary,
} from '../coalitions/coalitionsClient';
import { followUser } from './profileClient';
import { ProfileModal } from './ProfileModal';
import { useProfileActions } from './useProfileActions';
import type { MemberProfile } from './profileTypes';

/** Roles that hold `members.invite` — mirrors COALITION_ROLE_PERMISSIONS on the server. */
const INVITING_ROLES = new Set(['founder', 'steward', 'griot']);

const PICKER_OVERLAY: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
};

const PICKER_CARD: CSSProperties = {
    width: 'min(360px, 100%)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    padding: 12,
    display: 'grid',
    gap: 6,
};

const PICKER_ROW: CSSProperties = {
    textAlign: 'left',
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '8px 10px',
    cursor: 'pointer',
    fontSize: 14,
};

/**
 * `ProfileModal` wired to live Message / Block / Invite-to-coalition actions.
 * Mount this **only when a profile is open** — it calls `useProfileActions`
 * (router context) and fetches the viewer's coalitions on demand.
 *
 * The invite button appears only when the viewer can invite somewhere
 * (Founder / Steward / Griot in at least one coalition). Picking a coalition
 * sends the invitation; the invitee accepts from their own Coalitions tab.
 */
export const ConnectedProfileModal = ({
    profile,
    onClose,
}: {
    profile: MemberProfile;
    onClose: () => void;
}) => {
    const { startDm, block } = useProfileActions(onClose);
    const [invitable, setInvitable] = useState<CoalitionSummary[]>([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [inviteSent, setInviteSent] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchCoalitions({ mine: true })
            .then((rows) => {
                if (cancelled) return;
                setInvitable(
                    rows.filter((row) => row.viewerRole && INVITING_ROLES.has(row.viewerRole))
                );
            })
            .catch(() => {
                if (!cancelled) setInvitable([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const invite = (coalition: CoalitionSummary) => {
        setPickerOpen(false);
        setInviteSent(true);
        void inviteToCoalition(coalition.coalition.id, profile.userId).catch(() =>
            setInviteSent(false)
        );
        // The follow edge feeds the invitee's activity into the FOLLOWING feed
        // and is best-effort — a follow failure (e.g. a Matrix-only session with
        // no Blackout token) must never block or roll back the invitation.
        void followUser(profile.userId).catch(() => {});
    };

    return (
        <>
            <ProfileModal
                open
                profile={profile}
                onClose={onClose}
                onStartDm={startDm}
                onBlock={block}
                onInviteToCoalition={invitable.length > 0 ? () => setPickerOpen(true) : undefined}
                inviteSent={inviteSent}
            />
            {pickerOpen ? (
                <div
                    style={PICKER_OVERLAY}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Invite to a coalition"
                    data-testid="coalition-invite-picker"
                    onClick={() => setPickerOpen(false)}
                >
                    <div style={PICKER_CARD} onClick={(event) => event.stopPropagation()}>
                        <strong style={{ fontSize: 14 }}>
                            Invite {profile.displayName ?? profile.userId} to…
                        </strong>
                        {invitable.map((row) => (
                            <button
                                key={row.coalition.id}
                                type="button"
                                style={PICKER_ROW}
                                data-testid="coalition-invite-option"
                                onClick={() => invite(row)}
                            >
                                {row.coalition.name}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
        </>
    );
};

export default ConnectedProfileModal;
