import classNames from 'classnames';
import {
    normalizeProfileLayout,
    type PaletteAvailability,
    type ProfileBlockKind,
    type ProfileLayout,
} from '@blackout/core';
import * as css from './ProfileLayoutEditor.css';

const BLOCK_LABELS: Record<ProfileBlockKind, string> = {
    bio: 'Bio',
    status: 'Status',
    circle_map: 'Circle map',
    relay_wall: 'Boosted posts',
    coliseum_record: 'Coliseum record',
    creator_shop: 'Creator shop',
    mutual_aid_ledger: 'Mutual-aid ledger',
    pinned_media: 'Pinned media',
    wall: 'Wall',
    links: 'Links',
};

interface ProfileLayoutEditorProps {
    layout: ProfileLayout;
    onChange: (next: ProfileLayout) => void;
    palettes?: PaletteAvailability[];
    selectedPaletteId?: string;
    onSelectPalette?: (paletteId: string) => void;
}

const move = (layout: ProfileLayout, index: number, delta: number): ProfileLayout => {
    const target = index + delta;
    if (target < 0 || target >= layout.blocks.length) return layout;
    const blocks = [...layout.blocks];
    const [moved] = blocks.splice(index, 1);
    blocks.splice(target, 0, moved!);
    return { blocks };
};

/**
 * Arrange the profile: which blocks show, and in what order.
 *
 * Hiding keeps a block in place rather than removing it, so unhiding restores
 * the arrangement the owner built. Every role gets the same block list — a
 * creator simply raises their shop, an organizer their pledges.
 */
export const ProfileLayoutEditor = ({
    layout,
    onChange,
    palettes,
    selectedPaletteId,
    onSelectPalette,
}: ProfileLayoutEditorProps) => {
    const normalized = normalizeProfileLayout(layout);

    return (
        <div className={css.wrapper} data-testid="profile-layout-editor">
            <h3 className={css.heading}>Arrange your profile</h3>
            <p className={css.hint}>
                Hidden blocks keep their place, so turning one back on puts it where you left it.
            </p>

            <ul className={css.list}>
                {normalized.blocks.map((block, index) => (
                    <li key={block.kind} className={css.row} data-block-kind={block.kind}>
                        <span className={classNames(css.label, !block.visible && css.hiddenLabel)}>
                            {BLOCK_LABELS[block.kind]}
                        </span>
                        <button
                            type="button"
                            className={css.iconButton}
                            aria-label={`Move ${BLOCK_LABELS[block.kind]} up`}
                            disabled={index === 0}
                            onClick={() => onChange(move(normalized, index, -1))}
                        >
                            ↑
                        </button>
                        <button
                            type="button"
                            className={css.iconButton}
                            aria-label={`Move ${BLOCK_LABELS[block.kind]} down`}
                            disabled={index === normalized.blocks.length - 1}
                            onClick={() => onChange(move(normalized, index, 1))}
                        >
                            ↓
                        </button>
                        <button
                            type="button"
                            className={css.iconButton}
                            aria-pressed={block.visible}
                            aria-label={`${block.visible ? 'Hide' : 'Show'} ${
                                BLOCK_LABELS[block.kind]
                            }`}
                            onClick={() =>
                                onChange({
                                    blocks: normalized.blocks.map((entry, i) =>
                                        i === index ? { ...entry, visible: !entry.visible } : entry
                                    ),
                                })
                            }
                        >
                            {block.visible ? 'Shown' : 'Hidden'}
                        </button>
                    </li>
                ))}
            </ul>

            {palettes && palettes.length > 0 ? (
                <>
                    <h3 className={css.heading}>Palette</h3>
                    <p className={css.hint}>
                        A fixed set, so profiles still read as one place. Locked ones show what they
                        take.
                    </p>
                    <div className={css.paletteGrid} data-testid="profile-palette-grid">
                        {palettes.map(({ palette, unlocked, progress }) => (
                            <button
                                key={palette.id}
                                type="button"
                                disabled={!unlocked}
                                aria-pressed={selectedPaletteId === palette.id}
                                data-testid={`profile-palette-${palette.id}`}
                                className={classNames(
                                    css.paletteCard,
                                    selectedPaletteId === palette.id && css.paletteActive,
                                    !unlocked && css.paletteLocked
                                )}
                                onClick={() => unlocked && onSelectPalette?.(palette.id)}
                            >
                                <span className={css.swatchRow}>
                                    {[
                                        palette.tokens.accent,
                                        palette.tokens.panelBg,
                                        palette.tokens.headerBg,
                                        palette.tokens.linkColor,
                                    ].map((colour) => (
                                        <span
                                            key={colour}
                                            className={css.swatch}
                                            style={{ background: colour }}
                                        />
                                    ))}
                                </span>
                                <span className={css.paletteName}>{palette.label}</span>
                                <span className={css.paletteMeta}>
                                    {/* Locked palettes state the distance rather than
                                        hiding, the same way the Illumination meter
                                        reports what is still unlit. */}
                                    {progress
                                        ? `${progress.current} of ${progress.required}`
                                        : palette.description}
                                </span>
                            </button>
                        ))}
                    </div>
                </>
            ) : null}
        </div>
    );
};

export default ProfileLayoutEditor;
