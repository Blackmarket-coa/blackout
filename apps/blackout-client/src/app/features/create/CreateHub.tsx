import { type CSSProperties } from 'react';
import { Link } from 'react-router';
import { useSetAtom } from 'jotai';
import { createSpaceModalAtom, type CreateSpaceModalState } from '../../state/createSpaceModal';
import { CANOPIES_PATH, CREATE_IMPORT_PATH } from '../../pages/paths';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

// Stable payload identity for the create-space modal atom — same frozen-{}
// pattern the AppShell audit bridge uses (`pages/shell/AppShell.tsx`), so
// repeated clicks don't push a fresh object into the atom on every open.
const CREATE_SPACE_PAYLOAD = Object.freeze({}) as CreateSpaceModalState;

const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const headerStyle: CSSProperties = {
    padding: '16px 20px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const subtitleStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

const bodyStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 12,
    padding: '12px 16px 24px',
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 16,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #111827)',
};

const cardTitleStyle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 600 };
const cardTextStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
    lineHeight: 1.5,
};

const actionStyle: CSSProperties = {
    alignSelf: 'flex-start',
    marginTop: 'auto',
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-surface-hover, #1f2937)',
    color: 'inherit',
    font: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
};

/**
 * Create hub at `/create` — the landing page the onboarding flow links to
 * (`features/onboarding-creator/steps/{FirstActionStep,DensStep}`). Three
 * compact actions: open the existing create-canopy modal, point den creation
 * at the canopies area (dens are created inside a canopy), and the Discord
 * structure importer at `/create/import`.
 */
export const CreateHub = (): JSX.Element => {
    const setCreateSpaceModal = useSetAtom(createSpaceModalAtom);

    return (
        <section style={layoutStyle} data-shell-region="create" data-testid="create-hub">
            <header style={headerStyle}>
                <h1 style={titleStyle}>Create</h1>
                <p style={subtitleStyle}>
                    Start a new {BLACKOUT_TERMS.canopy.singular}, plant a{' '}
                    {BLACKOUT_TERMS.den.singular}, or bring a Discord server&apos;s structure with
                    you.
                </p>
            </header>
            <div style={bodyStyle}>
                <article style={cardStyle}>
                    <h2 style={cardTitleStyle}>Create a {BLACKOUT_TERMS.canopy.singular}</h2>
                    <p style={cardTextStyle}>
                        A {BLACKOUT_TERMS.canopy.singular} is your community&apos;s home — it holds
                        your {BLACKOUT_TERMS.den.plural}, members, and settings.
                    </p>
                    <button
                        type="button"
                        style={actionStyle}
                        data-testid="create-hub-canopy"
                        onClick={() => setCreateSpaceModal(CREATE_SPACE_PAYLOAD)}
                    >
                        New {BLACKOUT_TERMS.canopy.singular}
                    </button>
                </article>
                <article style={cardStyle}>
                    <h2 style={cardTitleStyle}>Create a {BLACKOUT_TERMS.den.singular}</h2>
                    <p style={cardTextStyle}>
                        {BLACKOUT_TERMS.den.titlePlural} live inside a{' '}
                        {BLACKOUT_TERMS.canopy.singular}: open one of your{' '}
                        {BLACKOUT_TERMS.canopy.plural} and use its channel sidebar to add text,
                        voice, forum, stage, or announcement {BLACKOUT_TERMS.den.plural}.
                    </p>
                    <Link to={CANOPIES_PATH} style={actionStyle} data-testid="create-hub-den">
                        Browse your {BLACKOUT_TERMS.canopy.plural}
                    </Link>
                </article>
                <article style={cardStyle}>
                    <h2 style={cardTitleStyle}>Import from Discord</h2>
                    <p style={cardTextStyle}>
                        Recreate a Discord server&apos;s structure here — categories, channels,
                        channel kinds, and topics. Roles and members are not imported.
                    </p>
                    <Link
                        to={CREATE_IMPORT_PATH}
                        style={actionStyle}
                        data-testid="create-hub-import"
                    >
                        Import structure
                    </Link>
                </article>
            </div>
        </section>
    );
};

export default CreateHub;
