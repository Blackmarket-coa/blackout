import { useCallback, useState } from 'react';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../../state/auth';
import {
    type DenDocumentModel,
    useUpsertDocument,
} from './useDenDocuments';

/**
 * Lightweight markdown editor for a single founding document.
 *
 * v1 deliberately ships as a plain textarea (with markdown shown as
 * preview-on-blur) rather than a full Slate rich-text editor. The plan
 * mentioned reusing the `MessageComposer` Slate stack but that path
 * carries voice/audio plumbing the documents surface doesn&apos;t need; the
 * upgrade lands when the editor needs collaborative-editing primitives.
 */
export interface DocumentEditorProps {
    roomId: string;
    doc: DenDocumentModel;
    onSaved?: (doc: DenDocumentModel) => void;
}

const styles = {
    root: { display: 'grid', gap: 8 } as const,
    head: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    } as const,
    textarea: {
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        padding: 8,
        minHeight: 220,
        fontFamily: 'monospace',
        fontSize: 13,
    } as const,
    btnRow: { display: 'flex', justifyContent: 'flex-end', gap: 8 } as const,
    btn: {
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        padding: '6px 10px',
    } as const,
    primary: {
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        background: 'var(--accent-primary)',
        color: 'var(--bg-surface)',
        padding: '6px 10px',
    } as const,
    meta: { fontSize: 12, color: 'var(--text-secondary)' } as const,
};

export function DocumentEditor({ roomId, doc, onSaved }: DocumentEditorProps) {
    const upsert = useUpsertDocument(roomId);
    const myUserId = useAtomValue(userIdAtom);
    const [title, setTitle] = useState(doc.title);
    const [body, setBody] = useState(doc.body);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const dirty = title !== doc.title || body !== doc.body;

    const save = useCallback(async () => {
        if (!myUserId) {
            setErr('Sign in to edit.');
            return;
        }
        setSaving(true);
        setErr(null);
        try {
            const next = {
                ...doc,
                title: title.trim() || doc.title,
                body,
                version: doc.version + 1,
                lastEditorId: myUserId,
                editedAt: new Date().toISOString(),
            };
            await upsert(next);
            onSaved?.({ ...next, eventId: doc.eventId });
        } catch (cause) {
            setErr(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setSaving(false);
        }
    }, [body, doc, myUserId, onSaved, title, upsert]);

    return (
        <section style={styles.root} data-testid={`document-editor-${doc.docId}`}>
            <header style={styles.head}>
                <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 8,
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        padding: '6px 10px',
                        fontSize: 14,
                        fontWeight: 600,
                        minWidth: 200,
                    }}
                    aria-label="Document title"
                />
                <span style={styles.meta}>
                    v{doc.version}
                    {doc.derivedFromTemplateId ? ` · seeded` : ''}
                    {doc.lastEditorId ? ` · last edit ${doc.lastEditorId}` : ''}
                </span>
            </header>
            <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                style={styles.textarea}
                aria-label="Document body (markdown)"
            />
            {err && (
                <p role="alert" style={{ color: 'var(--danger, #EF5350)', fontSize: 12 }}>
                    {err}
                </p>
            )}
            <div style={styles.btnRow}>
                <button
                    type="button"
                    style={styles.btn}
                    onClick={() => {
                        setTitle(doc.title);
                        setBody(doc.body);
                    }}
                    disabled={!dirty || saving}
                >
                    Revert
                </button>
                <button
                    type="button"
                    style={styles.primary}
                    onClick={() => void save()}
                    disabled={!dirty || saving}
                    data-testid={`document-save-${doc.docId}`}
                >
                    {saving ? 'Saving…' : 'Save version'}
                </button>
            </div>
        </section>
    );
}

export default DocumentEditor;
