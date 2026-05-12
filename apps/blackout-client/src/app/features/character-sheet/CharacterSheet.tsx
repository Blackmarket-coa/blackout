import { useCharacterSheet } from './useCharacterSheet';
import {
    useCharacterSheetSharing,
    useResetSheetSharing,
    useToggleSheetSection,
    useToggleSheetSharing,
} from './sharingPreferences';
import { useCanViewSheet, useCanViewSheetSection } from './useCanViewSheet';
import {
    CHARACTER_SHEET_SECTION_IDS,
    PLAYBOOK_CATALOG,
    type CharacterSheetSectionId,
    type PlaybookId,
} from '@blackout/protocol';
import { useAtomValue } from 'jotai';
import { joinedRoomsAtom } from '../../state/rooms';
import { userIdAtom } from '../../state/auth';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

const SECTION_LABELS: Record<CharacterSheetSectionId, string> = {
    header: 'Header',
    stats: 'Stats',
};

/**
 * Per-user Character Sheet (J4) with embedded Quest Log (J6).
 *
 * Stat-block visual idiom, solarpunk-flavored — no parchment textures
 * (banlist) and no XP bars (banlist revision still excludes
 * status-conferring affordances). The sheet shows:
 *
 *   • the playbook the user first planted under (identity anchor),
 *   • the roles they currently hold across dens (with term end),
 *   • a count of joined dens (one cheap stat),
 *   • a newest-first quest log rendered as narrative beats.
 *
 * Self-view by default. Cross-user view (J4 sharing) gates on
 * `useCanViewSheet`, which checks the holder's per-room `co.bmc.user.sheet.shared`
 * state events. Sharing is opt-in per den from the holder's own sheet.
 */
export interface CharacterSheetProps {
    /**
     * Optional user id we're rendering for. If omitted, falls back to the
     * current user (the hook reads from userIdAtom). When the rendered user
     * is not the viewer, the sheet honors the holder's per-room sharing
     * grants — viewers who share no den with a granted room see a private
     * placeholder instead.
     */
    userId?: string;
}

const styles = {
    page: { display: 'grid', gap: 16, padding: 16, maxWidth: 720, margin: '0 auto' } as const,
    block: {
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        background: 'var(--bg-surface)',
        padding: 12,
        display: 'grid',
        gap: 8,
    } as const,
    statRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
    } as const,
    stat: {
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        background: 'var(--bg-input)',
        padding: 10,
        display: 'grid',
        gap: 2,
    } as const,
    label: { fontSize: 11, color: 'var(--text-secondary)' } as const,
    value: { fontSize: 18, fontWeight: 700 } as const,
    rolesList: { margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 } as const,
    roleRow: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        padding: '6px 0',
        borderBottom: '1px dashed var(--border-default)',
    } as const,
    log: { margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 } as const,
    logRow: {
        padding: '6px 0',
        borderBottom: '1px dashed var(--border-default)',
        fontSize: 13,
    } as const,
};

function playbookLabel(id: PlaybookId | null): string {
    if (!id) return '—';
    return PLAYBOOK_CATALOG[id].name;
}

export function CharacterSheet({ userId }: CharacterSheetProps = {}) {
    const viewerId = useAtomValue(userIdAtom);
    const sheet = useCharacterSheet(userId);
    const canView = useCanViewSheet(userId ?? viewerId);
    const canViewHeader = useCanViewSheetSection(userId ?? viewerId, 'header');
    const canViewStats = useCanViewSheetSection(userId ?? viewerId, 'stats');
    const sharing = useCharacterSheetSharing();
    const toggleSharing = useToggleSheetSharing();
    const toggleSection = useToggleSheetSection();
    const resetSharing = useResetSheetSharing();
    const joinedRooms = useAtomValue(joinedRoomsAtom);

    if (!sheet) {
        return (
            <main style={styles.page} data-testid="character-sheet-empty">
                <p style={styles.label}>Sign in to see your character sheet.</p>
            </main>
        );
    }

    const isSelfView = !userId || userId === viewerId;

    if (!isSelfView && !canView) {
        return (
            <main style={styles.page} data-testid="character-sheet-private">
                <header style={styles.block}>
                    <h1 style={{ margin: 0, fontSize: 18 }}>{userId}</h1>
                    <p style={styles.label}>
                        This member hasn&apos;t shared their character sheet with any
                        {' '}{BLACKOUT_TERMS.den.singular} you&apos;re a part of. Sheets are
                        private by default — only the holder can choose to open them up.
                    </p>
                </header>
            </main>
        );
    }

    const copyDeepLink = async () => {
        if (typeof window === 'undefined') return;
        const url = `${window.location.origin}/character-sheet/${encodeURIComponent(sheet.userId)}`;
        try {
            await navigator.clipboard?.writeText?.(url);
        } catch {
            // Best-effort — clipboard write can fail without HTTPS or
            // user activation. The user can still grab the URL bar.
        }
    };

    return (
        <main style={styles.page} data-testid="character-sheet">
            {(isSelfView || canViewHeader) && (
                <header style={styles.block} data-testid="character-sheet-header">
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                        }}
                    >
                        <h1 style={{ margin: 0, fontSize: 18 }}>{sheet.userId}</h1>
                        <button
                            type="button"
                            onClick={() => void copyDeepLink()}
                            data-testid="character-sheet-copy-link"
                            title="Copy a link to this sheet"
                            style={{
                                fontSize: 11,
                                border: '1px solid var(--border-default)',
                                borderRadius: 999,
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                padding: '2px 10px',
                                cursor: 'pointer',
                            }}
                        >
                            Copy link
                        </button>
                    </div>
                    <p style={styles.label}>
                        A record of the {BLACKOUT_TERMS.den.plural} you&apos;ve planted, the
                        {' '}roles you&apos;ve carried, and the moments along the way. Yours to read,
                        yours to share when you choose.
                    </p>
                </header>
            )}

            {(isSelfView || canViewStats) && (
                <section style={styles.statRow} data-testid="character-sheet-stats">
                    <div style={styles.stat}>
                        <span style={styles.label}>First {BLACKOUT_TERMS.playbook.singular}</span>
                        <span style={styles.value}>{playbookLabel(sheet.firstPlaybook)}</span>
                    </div>
                    <div style={styles.stat}>
                        <span style={styles.label}>{BLACKOUT_TERMS.den.titlePlural} joined</span>
                        <span style={styles.value}>{sheet.densJoined}</span>
                    </div>
                    <div style={styles.stat}>
                        <span style={styles.label}>Roles held</span>
                        <span style={styles.value}>{sheet.rolesHeld.length}</span>
                    </div>
                    <div style={styles.stat}>
                        <span style={styles.label}>Quests completed</span>
                        <span style={styles.value}>{sheet.questLog.length}</span>
                    </div>
                </section>
            )}

            <section style={styles.block}>
                <strong>Roles you carry</strong>
                {sheet.rolesHeld.length === 0 ? (
                    <p style={styles.label}>
                        No roles held right now. Roles are term-bound — opening an election in
                        a {BLACKOUT_TERMS.den.singular} adds the first one here.
                    </p>
                ) : (
                    <ul style={styles.rolesList}>
                        {sheet.rolesHeld.map((role) => (
                            <li
                                key={`${role.roomId}:${role.roleId}`}
                                style={styles.roleRow}
                                data-testid={`character-role-${role.roleId}`}
                            >
                                <span>
                                    <strong>{role.roleName}</strong>{' '}
                                    <span style={styles.label}>in {role.roomName}</span>
                                </span>
                                <span style={styles.label}>
                                    term ends {role.termEnd.slice(0, 10)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section style={styles.block} data-testid="character-sheet-quest-log">
                <strong>Quest log</strong>
                {sheet.questLog.length === 0 ? (
                    <p style={styles.label}>
                        Nothing logged yet. The quest sheet ticks beats here as you do them.
                    </p>
                ) : (
                    <ul style={styles.log}>
                        {sheet.questLog.map((entry, index) => (
                            <li
                                key={`${entry.id}-${index}`}
                                style={styles.logRow}
                                data-testid={`character-quest-${entry.id}`}
                            >
                                <strong>{entry.narrative}</strong>{' '}
                                <span style={styles.label}>
                                    · {new Date(entry.completedAt).toLocaleDateString()}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {isSelfView && (
            <section style={styles.block} data-testid="character-sheet-sharing">
                <header
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <strong>Sharing</strong>
                    {sharing.sharedRoomSet.size > 0 && (
                        <button
                            type="button"
                            onClick={() => void resetSharing()}
                            style={{
                                fontSize: 12,
                                border: '1px solid var(--border-default)',
                                borderRadius: 999,
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                padding: '2px 10px',
                                cursor: 'pointer',
                            }}
                            data-testid="character-sheet-stop-sharing"
                        >
                            Stop sharing everywhere
                        </button>
                    )}
                </header>
                <p style={styles.label}>
                    Your sheet is private by default. Opt in per {BLACKOUT_TERMS.den.singular}
                    {' '}so its members can see it; toggle off anytime.
                </p>
                {joinedRooms.length === 0 ? (
                    <p style={styles.label}>You haven&apos;t joined any {BLACKOUT_TERMS.den.plural} yet.</p>
                ) : (
                    <ul
                        style={{
                            margin: 0,
                            padding: 0,
                            listStyle: 'none',
                            display: 'grid',
                            gap: 4,
                        }}
                    >
                        {joinedRooms.map((room) => {
                            const isShared = sharing.isSharedWith(room.roomId);
                            const sectionsOn = sharing.sectionsFor(room.roomId);
                            return (
                                <li
                                    key={room.roomId}
                                    style={{
                                        display: 'grid',
                                        gap: 4,
                                        padding: '4px 0',
                                        borderBottom: '1px dashed var(--border-default)',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: 8,
                                            alignItems: 'center',
                                        }}
                                    >
                                        <span style={{ fontSize: 13 }}>
                                            {room.name ?? room.roomId}
                                        </span>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={isShared}
                                            onClick={() => void toggleSharing(room.roomId)}
                                            data-testid={`character-sheet-share-${room.roomId}`}
                                            style={{
                                                fontSize: 12,
                                                border: `1px solid ${
                                                    isShared
                                                        ? 'var(--accent-primary)'
                                                        : 'var(--border-default)'
                                                }`,
                                                borderRadius: 999,
                                                background: isShared
                                                    ? 'var(--accent-muted)'
                                                    : 'var(--bg-input)',
                                                color: 'var(--text-primary)',
                                                padding: '2px 10px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {isShared ? 'Sharing' : 'Share'}
                                        </button>
                                    </div>
                                    {isShared && (
                                        <div
                                            data-testid={`character-sheet-sections-${room.roomId}`}
                                            style={{
                                                display: 'flex',
                                                gap: 6,
                                                flexWrap: 'wrap',
                                                paddingLeft: 4,
                                            }}
                                        >
                                            <span style={styles.label}>Also share</span>
                                            {CHARACTER_SHEET_SECTION_IDS.map((section) => {
                                                const on = sectionsOn.has(section);
                                                return (
                                                    <button
                                                        key={section}
                                                        type="button"
                                                        role="switch"
                                                        aria-checked={on}
                                                        onClick={() =>
                                                            void toggleSection(
                                                                room.roomId,
                                                                section,
                                                            )
                                                        }
                                                        data-testid={`character-sheet-section-${room.roomId}-${section}`}
                                                        style={{
                                                            fontSize: 11,
                                                            border: `1px solid ${
                                                                on
                                                                    ? 'var(--accent-primary)'
                                                                    : 'var(--border-default)'
                                                            }`,
                                                            borderRadius: 999,
                                                            background: on
                                                                ? 'var(--accent-muted)'
                                                                : 'var(--bg-input)',
                                                            color: 'var(--text-primary)',
                                                            padding: '1px 8px',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        {on ? '✓ ' : ''}
                                                        {SECTION_LABELS[section]}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
            )}
        </main>
    );
}

export default CharacterSheet;
