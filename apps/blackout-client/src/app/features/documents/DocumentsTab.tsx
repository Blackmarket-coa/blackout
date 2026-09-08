import { useCallback, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../../state/auth';
import { useDenDocuments, useUpsertDocument, type DenDocumentModel } from './useDenDocuments';
import { DocumentEditor } from './DocumentEditor';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { availableTemplates, buildNewDocument, nextBlankDocId } from './newDocument';

/**
 * Documents tab — surfaced inside the Coalition multi-tab view. Lists every
 * founding doc attached to the den and renders the selected one through
 * the lightweight DocumentEditor. v1 stays read-and-edit (no inline
 * collab), but the version stamp + state-event history give a clean path
 * to per-edit attribution in a follow-up.
 */
export interface DocumentsTabProps {
    roomId: string;
}

const styles = {
    root: { display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, padding: 16 } as const,
    list: {
        display: 'grid',
        gap: 6,
        alignContent: 'start',
    } as const,
    listBtn: (active: boolean) => ({
        textAlign: 'left' as const,
        border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        background: active ? 'var(--accent-muted)' : 'var(--bg-input)',
        color: 'var(--text-primary)',
        borderRadius: 8,
        padding: '8px 10px',
        cursor: 'pointer',
    }),
    empty: { color: 'var(--text-secondary)', fontSize: 13 } as const,
    helper: { color: 'var(--text-secondary)', fontSize: 12, margin: 0 } as const,
    addBtn: {
        textAlign: 'left' as const,
        border: '1px dashed var(--border-default)',
        background: 'transparent',
        color: 'var(--text-secondary)',
        borderRadius: 8,
        padding: '6px 10px',
        cursor: 'pointer',
        fontSize: 12,
    } as const,
};

export function DocumentsTab({ roomId }: DocumentsTabProps) {
    const docs = useDenDocuments(roomId);
    const upsert = useUpsertDocument(roomId);
    const myUserId = useAtomValue(userIdAtom);
    const [selectedId, setSelectedId] = useState<string | null>(docs[0]?.docId ?? null);
    const [addErr, setAddErr] = useState<string | null>(null);

    // Seeds this den never received. `SEEDS` gives bylaws to Workshop, Commons,
    // Local, Confluence and Order but not to Circle or Grove, so this is the
    // only route to bylaws for a circle that later decides to incorporate.
    const addable = useMemo(() => availableTemplates(docs), [docs]);

    const addDocument = useCallback(
        async (template: typeof addable[number] | null) => {
            if (!myUserId) {
                setAddErr('Sign in to add a document.');
                return;
            }
            setAddErr(null);
            try {
                const payload = buildNewDocument({
                    template,
                    docId: nextBlankDocId(docs),
                    authorId: myUserId,
                    now: new Date().toISOString(),
                });
                await upsert(payload);
                setSelectedId(payload.docId);
            } catch (cause) {
                setAddErr(cause instanceof Error ? cause.message : String(cause));
            }
        },
        [docs, myUserId, upsert]
    );

    const selected: DenDocumentModel | undefined = useMemo(
        () => docs.find((d) => d.docId === selectedId) ?? docs[0],
        [docs, selectedId]
    );

    if (docs.length === 0) {
        return (
            <main style={{ padding: 16 }} data-testid="documents-tab">
                <h2 style={{ marginTop: 0 }}>Founding documents</h2>
                <p style={styles.empty}>
                    This {BLACKOUT_TERMS.den.singular} hasn&apos;t seeded any documents yet. Plant
                    the den from a playbook to start with bylaws, mission, and decision-rule seeds —
                    or start one here.
                </p>
                <div style={{ display: 'grid', gap: 6, marginTop: 12, maxWidth: 320 }}>
                    {addable.map((template) => (
                        <button
                            key={template.id}
                            type="button"
                            style={styles.addBtn}
                            onClick={() => void addDocument(template)}
                            data-testid={`documents-tab-add-${template.id}`}
                        >
                            + Add {template.title}
                        </button>
                    ))}
                    <button
                        type="button"
                        style={styles.addBtn}
                        onClick={() => void addDocument(null)}
                        data-testid="documents-tab-add-blank"
                    >
                        + Blank document
                    </button>
                </div>
                {addErr && (
                    <p role="alert" style={{ color: 'var(--danger, #EF5350)', fontSize: 12 }}>
                        {addErr}
                    </p>
                )}
            </main>
        );
    }

    return (
        <main style={styles.root} data-testid="documents-tab">
            <aside style={styles.list}>
                <h2 style={{ marginTop: 0, fontSize: 16 }}>Founding documents</h2>
                <p style={styles.helper}>
                    Every edit lands as a new version — Matrix retains the history.
                </p>
                {docs.map((doc) => (
                    <button
                        key={doc.docId}
                        type="button"
                        onClick={() => setSelectedId(doc.docId)}
                        style={styles.listBtn(doc.docId === selected?.docId)}
                        data-testid={`documents-tab-item-${doc.docId}`}
                    >
                        <div style={{ fontWeight: 600 }}>{doc.title}</div>
                        <div style={styles.helper}>v{doc.version}</div>
                    </button>
                ))}
                {addable.map((template) => (
                    <button
                        key={template.id}
                        type="button"
                        style={styles.addBtn}
                        onClick={() => void addDocument(template)}
                        data-testid={`documents-tab-add-${template.id}`}
                    >
                        + Add {template.title}
                    </button>
                ))}
                <button
                    type="button"
                    style={styles.addBtn}
                    onClick={() => void addDocument(null)}
                    data-testid="documents-tab-add-blank"
                >
                    + Blank document
                </button>
                {addErr && (
                    <p role="alert" style={{ color: 'var(--danger, #EF5350)', fontSize: 12 }}>
                        {addErr}
                    </p>
                )}
            </aside>
            <section>
                {selected ? (
                    <DocumentEditor roomId={roomId} doc={selected} />
                ) : (
                    <p style={styles.empty}>Pick a document on the left.</p>
                )}
            </section>
        </main>
    );
}

export default DocumentsTab;
