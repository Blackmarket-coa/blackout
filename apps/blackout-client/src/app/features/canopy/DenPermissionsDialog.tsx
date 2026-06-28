import { type CSSProperties, useMemo, useState } from 'react';
import type { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { getPowerLevelTag, getPowers, usePowerLevelTags } from '../../hooks/usePowerLevelTags';
import {
    DEN_PERMISSION_ROWS,
    type DenPermissionKey,
    buildDenPowerLevels,
    readDenPermission,
    writeDenPermissions,
} from './denPermissions';

const OVERLAY_STYLE: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
};

const CARD_STYLE: CSSProperties = {
    width: 'min(520px, 100%)',
    maxHeight: 'min(680px, 100%)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 14,
    boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
};

const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid var(--border-default)',
};

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 4px',
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
};

const selectStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '6px 8px',
    fontSize: 13,
    minWidth: 130,
};

const buttonStyle = (variant: 'primary' | 'subtle'): CSSProperties => ({
    border: '1px solid var(--border-default)',
    background: variant === 'primary' ? 'var(--accent-primary)' : 'var(--bg-input)',
    color: variant === 'primary' ? 'var(--bg-surface)' : 'var(--text-primary)',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
});

/**
 * Lightweight per-den permissions editor. Reads the den's `m.room.power_levels`
 * via `usePowerLevels`, presents a small set of "who can …" rows as power-tier
 * dropdowns, and writes the merged power-levels content on save. Mirrors the
 * plain-CSS canopy dialog style (e.g. `ForumSettingsDialog`) rather than the
 * heavier folds-based `PermissionGroups`.
 */
export const DenPermissionsDialog = ({ room, onClose }: { room: Room; onClose: () => void }) => {
    const mx = useMatrixClient();
    const powerLevels = usePowerLevels(room);
    const tags = usePowerLevelTags(room, powerLevels);
    const [edits, setEdits] = useState<Partial<Record<DenPermissionKey, number>>>({});
    const [busy, setBusy] = useState(false);

    // Offer the common Discord-like tiers plus whatever powers the room already
    // uses and any current row values, so every effective threshold is selectable.
    const options = useMemo(() => {
        const powers = new Set<number>([0, 50, 100, ...getPowers(tags)]);
        DEN_PERMISSION_ROWS.forEach((rowDef) =>
            powers.add(readDenPermission(powerLevels, rowDef.key))
        );
        return [...powers].sort((a, b) => a - b);
    }, [tags, powerLevels]);

    const valueFor = (key: DenPermissionKey) => edits[key] ?? readDenPermission(powerLevels, key);
    const dirty = Object.keys(edits).length > 0;

    const save = async () => {
        if (busy || !dirty) return;
        setBusy(true);
        try {
            await writeDenPermissions(mx, room.roomId, buildDenPowerLevels(powerLevels, edits));
            onClose();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            style={OVERLAY_STYLE}
            role="dialog"
            aria-modal="true"
            aria-label={`Permissions for ${room.name}`}
            data-testid="den-permissions-dialog"
            onClick={onClose}
        >
            <div style={CARD_STYLE} onClick={(event) => event.stopPropagation()}>
                <header style={headerStyle}>
                    <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: 16 }}>Permissions</strong>
                        <div
                            style={{
                                fontSize: 12,
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {room.name}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close permissions"
                        style={{ ...buttonStyle('subtle'), width: 32, height: 32, padding: 0 }}
                    >
                        ✕
                    </button>
                </header>

                <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 16px' }}>
                    {DEN_PERMISSION_ROWS.map((rowDef) => (
                        <div
                            key={rowDef.key}
                            style={rowStyle}
                            data-testid={`den-permission-${rowDef.key}`}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14 }}>{rowDef.label}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {rowDef.description}
                                </div>
                            </div>
                            <select
                                style={selectStyle}
                                value={valueFor(rowDef.key)}
                                aria-label={rowDef.label}
                                data-testid={`den-permission-select-${rowDef.key}`}
                                onChange={(event) => {
                                    const power = Number(event.target.value);
                                    setEdits((prev) => ({ ...prev, [rowDef.key]: power }));
                                }}
                            >
                                {options.map((power) => (
                                    <option key={power} value={power}>
                                        {getPowerLevelTag(tags, power).name} ({power})
                                    </option>
                                ))}
                            </select>
                        </div>
                    ))}
                </div>

                <footer
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 8,
                        padding: '12px 16px',
                        borderTop: '1px solid var(--border-default)',
                    }}
                >
                    <button type="button" style={buttonStyle('subtle')} onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        style={{ ...buttonStyle('primary'), opacity: dirty ? 1 : 0.6 }}
                        disabled={busy || !dirty}
                        data-testid="den-permissions-save"
                        onClick={() => void save()}
                    >
                        {busy ? 'Saving…' : 'Save'}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default DenPermissionsDialog;
