import { useMemo, useState } from 'react';
import { Descendant, Editor, Transforms, createEditor } from 'slate';
import { Editable, Slate, withReact } from 'slate-react';
import { withHistory } from 'slate-history';
import { useSendMessage } from '../../hooks/bmc-useTimeline';
import type { ForumTag } from './useForum';

const toBody = (value: Descendant[]): string => {
    return value
        .map((node) => {
            if (!Editor.isEditor(node) && 'children' in node) {
                return node.children.map((child) => ('text' in child ? child.text : '')).join('');
            }
            return '';
        })
        .join('\n')
        .trim();
};

const initialValue = [{ type: 'paragraph', children: [{ text: '' }] }] as unknown as Descendant[];

export const CreatePostModal = ({
    roomId,
    tags,
    requireTag,
    open,
    onClose,
    onPosted,
}: {
    roomId: string;
    tags: ForumTag[];
    requireTag: boolean;
    open: boolean;
    onClose: () => void;
    onPosted: () => void;
}) => {
    const [title, setTitle] = useState('');
    const [value, setValue] = useState<Descendant[]>(initialValue);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [sending, setSending] = useState(false);
    const { sendRichText } = useSendMessage(roomId);

    const editor = useMemo(() => withHistory(withReact(createEditor())), []);

    if (!open) return null;

    const submit = async () => {
        const body = toBody(value);
        if (!title.trim()) return;
        if (requireTag && selectedTags.length === 0) return;

        setSending(true);
        try {
            const finalBody = [title.trim(), body].filter(Boolean).join('\n');
            await sendRichText({
                msgtype: 'm.text',
                body: finalBody,
                'co.bmc.forum.tags': selectedTags,
            });

            setTitle('');
            setSelectedTags([]);
            Transforms.delete(editor, {
                at: { anchor: Editor.start(editor, []), focus: Editor.end(editor, []) },
            });
            onPosted();
            onClose();
        } finally {
            setSending(false);
        }
    };

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50 }}
            onClick={onClose}
        >
            <div
                style={{
                    width: 700,
                    maxWidth: '96vw',
                    margin: '8vh auto',
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    background: 'var(--bg-surface)',
                    padding: 12,
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <h3 style={{ marginTop: 0 }}>Create New Post</h3>

                <label style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Title (first line)
                    </span>
                    <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Post title"
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: '8px 10px',
                        }}
                    />
                </label>

                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        Body (rich text editor)
                    </div>
                    <div
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            padding: 8,
                            minHeight: 120,
                        }}
                    >
                        <Slate
                            editor={editor}
                            initialValue={value}
                            onValueChange={(next) => setValue(next)}
                        >
                            <Editable placeholder="Write your forum post…" />
                        </Slate>
                    </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        Tags
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {tags.map((tag) => {
                            const selected = selectedTags.includes(tag.name);
                            return (
                                <button
                                    key={tag.name}
                                    type="button"
                                    onClick={() => {
                                        setSelectedTags((prev) =>
                                            selected
                                                ? prev.filter((item) => item !== tag.name)
                                                : [...prev, tag.name],
                                        );
                                    }}
                                    style={{
                                        border: `1px solid ${tag.color}`,
                                        borderRadius: 999,
                                        background: selected ? tag.color : 'transparent',
                                        color: selected ? '#fff' : tag.color,
                                        padding: '3px 8px',
                                        fontSize: 12,
                                    }}
                                >
                                    {tag.emoji} {tag.name}
                                </button>
                            );
                        })}
                    </div>
                    {requireTag && selectedTags.length === 0 ? (
                        <div style={{ marginTop: 6, color: 'var(--warning)', fontSize: 12 }}>
                            At least one tag is required.
                        </div>
                    ) : null}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: '6px 10px',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={
                            !title.trim() || sending || (requireTag && selectedTags.length === 0)
                        }
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--accent-primary)',
                            color: 'var(--bg-surface)',
                            padding: '6px 10px',
                        }}
                    >
                        {sending ? 'Posting…' : 'Post'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreatePostModal;
