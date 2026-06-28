import { type CSSProperties, useState } from 'react';
import {
    type ForumSettings,
    type ForumTag,
    useForumSettings,
    useSetForumSettings,
} from './useForum';

const OVERLAY_STYLE: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
};

const CARD_STYLE: CSSProperties = {
    width: 'min(560px, 100%)',
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

const inputStyle: CSSProperties = {
    width: '100%',
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 14,
};

const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: 12,
    color: 'var(--text-muted)',
    margin: '14px 0 4px',
};

const primaryButtonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    background: 'var(--accent-primary)',
    color: 'var(--bg-surface)',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
};

const subtleButtonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 13,
    cursor: 'pointer',
};

const checkboxRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    fontSize: 14,
};

const SORTS: Array<ForumSettings['defaultSort']> = ['hot', 'new', 'top'];

const newTag = (): ForumTag => ({ name: '', color: '#7289da', emoji: '🏷️' });

/**
 * Editor for a forum den's `co.bmc.forum` settings (enabled, default sort,
 * guidelines, require-tag, and the tag palette). Thin wrapper over the existing
 * `useForumSettings`/`useSetForumSettings` hooks; mirrors the canopy settings
 * dialog's overlay styling. Launched from the forum den's row menu.
 */
export const ForumSettingsDialog = ({
    roomId,
    onClose,
}: {
    roomId: string;
    onClose: () => void;
}) => {
    const current = useForumSettings(roomId).data;
    const saveSettings = useSetForumSettings(roomId);
    const [settings, setSettings] = useState<ForumSettings>(current);
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const update = (patch: Partial<ForumSettings>) =>
        setSettings((prev) => ({ ...prev, ...patch }));
    const updateTag = (index: number, patch: Partial<ForumTag>) =>
        update({ tags: settings.tags.map((tag, i) => (i === index ? { ...tag, ...patch } : tag)) });

    const save = async () => {
        if (busy) return;
        setBusy(true);
        setStatus(null);
        try {
            const cleaned: ForumSettings = {
                ...settings,
                guidelines: settings.guidelines.trim(),
                tags: settings.tags
                    .map((tag) => ({
                        name: tag.name.trim(),
                        color: tag.color,
                        emoji: tag.emoji.trim() || '🏷️',
                    }))
                    .filter((tag) => tag.name.length > 0),
            };
            await saveSettings(cleaned);
            setStatus('Saved.');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Could not save.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            style={OVERLAY_STYLE}
            role="dialog"
            aria-modal="true"
            aria-label="Forum settings"
            data-testid="forum-settings-dialog"
            onClick={onClose}
        >
            <div style={CARD_STYLE} onClick={(event) => event.stopPropagation()}>
                <header
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 16px',
                        borderBottom: '1px solid var(--border-default)',
                    }}
                >
                    <strong style={{ fontSize: 16 }}>Forum settings</strong>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close forum settings"
                        style={{ ...subtleButtonStyle, width: 30, height: 30, padding: 0 }}
                    >
                        ✕
                    </button>
                </header>

                <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
                    <label style={checkboxRowStyle}>
                        <input
                            type="checkbox"
                            checked={settings.enabled}
                            data-testid="forum-settings-enabled"
                            onChange={(event) => update({ enabled: event.target.checked })}
                        />
                        Forum mode enabled
                    </label>

                    <label style={labelStyle} htmlFor="forum-default-sort">
                        Default sort
                    </label>
                    <select
                        id="forum-default-sort"
                        style={inputStyle}
                        value={settings.defaultSort}
                        data-testid="forum-settings-sort"
                        onChange={(event) =>
                            update({
                                defaultSort: event.target.value as ForumSettings['defaultSort'],
                            })
                        }
                    >
                        {SORTS.map((sort) => (
                            <option key={sort} value={sort}>
                                {sort.toUpperCase()}
                            </option>
                        ))}
                    </select>

                    <label style={labelStyle} htmlFor="forum-guidelines">
                        Guidelines
                    </label>
                    <textarea
                        id="forum-guidelines"
                        style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                        value={settings.guidelines}
                        placeholder="Posting guidelines shown at the top of the forum"
                        onChange={(event) => update({ guidelines: event.target.value })}
                    />

                    <label style={checkboxRowStyle}>
                        <input
                            type="checkbox"
                            checked={settings.requireTag}
                            data-testid="forum-settings-require-tag"
                            onChange={(event) => update({ requireTag: event.target.checked })}
                        />
                        Require a tag on every post
                    </label>

                    <div style={{ ...labelStyle, marginBottom: 8 }}>Tags</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {settings.tags.map((tag, index) => (
                            // eslint-disable-next-line react/no-array-index-key
                            <div
                                key={index}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <input
                                    aria-label={`Tag ${index + 1} emoji`}
                                    value={tag.emoji}
                                    data-testid="forum-settings-tag-emoji"
                                    onChange={(event) =>
                                        updateTag(index, { emoji: event.target.value })
                                    }
                                    style={{
                                        ...inputStyle,
                                        width: 48,
                                        flex: '0 0 auto',
                                        textAlign: 'center',
                                    }}
                                />
                                <input
                                    aria-label={`Tag ${index + 1} name`}
                                    value={tag.name}
                                    placeholder="tag name"
                                    data-testid="forum-settings-tag-name"
                                    onChange={(event) =>
                                        updateTag(index, { name: event.target.value })
                                    }
                                    style={inputStyle}
                                />
                                <input
                                    type="color"
                                    aria-label={`Tag ${index + 1} color`}
                                    value={tag.color}
                                    data-testid="forum-settings-tag-color"
                                    onChange={(event) =>
                                        updateTag(index, { color: event.target.value })
                                    }
                                    style={{
                                        width: 36,
                                        height: 34,
                                        flex: '0 0 auto',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 8,
                                        background: 'var(--bg-input)',
                                        cursor: 'pointer',
                                    }}
                                />
                                <button
                                    type="button"
                                    aria-label={`Remove tag ${index + 1}`}
                                    data-testid="forum-settings-tag-remove"
                                    onClick={() =>
                                        update({
                                            tags: settings.tags.filter((_, i) => i !== index),
                                        })
                                    }
                                    style={{ ...subtleButtonStyle, flex: '0 0 auto' }}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            style={{ ...subtleButtonStyle, alignSelf: 'start' }}
                            data-testid="forum-settings-add-tag"
                            onClick={() => update({ tags: [...settings.tags, newTag()] })}
                        >
                            ＋ Add tag
                        </button>
                    </div>
                </div>

                <footer
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        borderTop: '1px solid var(--border-default)',
                    }}
                >
                    <button
                        type="button"
                        style={primaryButtonStyle}
                        disabled={busy}
                        data-testid="forum-settings-save"
                        onClick={() => void save()}
                    >
                        {busy ? 'Saving…' : 'Save changes'}
                    </button>
                    {status ? <small style={{ color: 'var(--text-muted)' }}>{status}</small> : null}
                </footer>
            </div>
        </div>
    );
};

export default ForumSettingsDialog;
