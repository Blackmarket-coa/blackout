import {
    type ClipboardEvent,
    type DragEvent,
    type KeyboardEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Editor,
    Element as SlateElement,
    Node,
    Range,
    Text,
    Transforms,
    createEditor,
} from 'slate';
import { withHistory } from 'slate-history';
import { Editable, ReactEditor, Slate, useSlate, withReact } from 'slate-react';
import { useAtom, useAtomValue } from 'jotai';
import { useLegacyRoomMembersAdapter as useRoomMembers } from '../../plugins/matrix-adapters/hooks/useLegacyRoomAdapter';
import { useNavigationSpaceTree } from '../../plugins/navigation';
import {
    useLegacySendMessageAdapter as useSendMessage,
    useLegacyEditMessageAdapter as useEditMessage,
} from '../../plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';
import { useLegacySendTypingAdapter as useSendTyping } from '../../plugins/matrix-adapters/hooks/useLegacyTypingAdapter';
import { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useStateEvent } from '../../hooks/useStateEvent';
import { StateEvent } from '../../../types/matrix/room';
import { composerCommandPayloadAtom } from '../../state/composer';
import { uploadMedia } from '../media/utils/matrixMedia';
import { HideMessageDialog } from '../steganography';
import { useDismissOnOutsideOrEscape } from './useDismissOnOutsideOrEscape';
import { useAttachPhoto } from './attachments/useAttachPhoto';
import { resetEditor } from '../../components/editor/utils';
import { emojis } from '../../plugins/emoji';
import { EmojiPicker } from './EmojiPicker';
import { createScheduledMessage } from './scheduledMessagesClient';
import { sanitizeFormattedBody, sanitizeUrlsInText } from '../../utils/sanitizeUrl';
import { stripImageMetadata } from '../../utils/stripImageMetadata';
import { privacyToolsSettingsAtom } from '../privacy-tools/privacyToolsAtoms';
import {
    SLOWMODE_STATE_EVENT_TYPE,
    evaluateSlowmode,
    parseSlowmodeConfig,
} from './slowmode';

const MAX_SUGGESTIONS = 8;
const MAX_MESSAGE_LENGTH = 8000;
const DRAFT_STORAGE_PREFIX = 'blackout.draft.';

const loadDraft = (roomId: string): string => {
    try {
        return window.localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${roomId}`) ?? '';
    } catch {
        return '';
    }
};

const saveDraft = (roomId: string, text: string): void => {
    try {
        if (text) {
            window.localStorage.setItem(`${DRAFT_STORAGE_PREFIX}${roomId}`, text);
        } else {
            window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${roomId}`);
        }
    } catch {
        // localStorage may be unavailable (private mode); drafts are best-effort.
    }
};

// Full emojibase shortcode → unicode lookup, replacing the old 8-entry list.
const EMOJI_BY_SHORTCODE = new Map<string, string>();
for (const entry of emojis) {
    const codes = Array.isArray(entry.shortcodes)
        ? entry.shortcodes
        : entry.shortcode
        ? [entry.shortcode]
        : [];
    for (const code of codes) {
        if (!EMOJI_BY_SHORTCODE.has(code)) EMOJI_BY_SHORTCODE.set(code, entry.unicode);
    }
}

type MentionKind = 'user' | 'room' | 'emoji';

type CustomText = {
    text: string;
    bold?: boolean;
    italic?: boolean;
    strike?: boolean;
    code?: boolean;
};

type ParagraphElement = { type: 'paragraph'; children: CustomText[] };
type CodeBlockElement = { type: 'code_block'; children: CustomText[] };
type MentionElement = {
    type: 'mention';
    mentionKind: MentionKind;
    id: string;
    label: string;
    children: CustomText[];
};
type LinkElement = { type: 'link'; href: string; children: CustomText[] };

type CustomElement = ParagraphElement | CodeBlockElement | MentionElement | LinkElement;

// A block's children mix text leaves with inline element nodes (mentions, links).
type InlineNode = CustomText | CustomElement;

interface ComposerTarget {
    mode: 'new' | 'reply' | 'thread' | 'edit';
    eventId?: string;
    rootEventId?: string;
    quotedText?: string;
}

interface MessageComposerProps {
    roomId: string;
    target?: ComposerTarget;
    initialMarkdown?: string;
    placeholder?: string;
    onSent?: () => void;
}

interface Suggestion {
    id: string;
    label: string;
    kind: MentionKind;
}

interface CommandPreset {
    id: string;
    label: string;
    template: string;
}

const initialValue: CustomElement[] = [{ type: 'paragraph', children: [{ text: '' }] }];

const COMMAND_PRESETS: CommandPreset[] = [
    { id: 'shrug', label: '/shrug', template: '/shrug' },
    { id: 'tableflip', label: '/tableflip', template: '/tableflip' },
    { id: 'topic', label: '/topic <new-topic>', template: '/topic ' },
];

const executeCommandTemplate = (command: CommandPreset, body: string): string => {
    if (command.id === 'shrug') return `${body} ¯\\_(ツ)_/¯`.trim();
    if (command.id === 'tableflip') return `${body}\n(╯°□°）╯︵ ┻━┻`.trim();
    if (command.id === 'topic') return `Topic update request: ${body}`.trim();
    return `${command.template}\n${body}`.trim();
};

const fuzzyMatch = (term: string, query: string): boolean => {
    if (!query) return true;
    let i = 0;
    for (const c of term.toLowerCase()) {
        if (c === query[i]?.toLowerCase()) i += 1;
        if (i === query.length) return true;
    }
    return false;
};

const toPlainText = (value: CustomElement[]): string =>
    value
        .map((node) => Node.string(node as any))
        .join('\n')
        .trim();

const escapeHtml = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

const leafToHtml = (leaf: CustomText): string => {
    let chunk = escapeHtml(leaf.text);
    if (leaf.code) chunk = `<code>${chunk}</code>`;
    if (leaf.bold) chunk = `<strong>${chunk}</strong>`;
    if (leaf.italic) chunk = `<em>${chunk}</em>`;
    if (leaf.strike) chunk = `<del>${chunk}</del>`;
    return chunk;
};

const inlineToHtml = (node: InlineNode): string => {
    if (!('type' in node)) return leafToHtml(node);

    if (node.type === 'mention') {
        if (node.mentionKind === 'user' || node.mentionKind === 'room') {
            const prefix = node.mentionKind === 'room' ? '#' : '';
            return `<a href="https://matrix.to/#/${escapeHtml(node.id)}">${prefix}${escapeHtml(
                node.label
            )}</a>`;
        }
        return escapeHtml(node.label);
    }

    if (node.type === 'link') {
        const text = (node.children as InlineNode[]).map(inlineToHtml).join('');
        return `<a href="${escapeHtml(node.href)}">${text}</a>`;
    }

    return (node.children as InlineNode[]).map(inlineToHtml).join('');
};

export const toHtml = (value: CustomElement[]): string => {
    return value
        .map((element) => {
            if (element.type === 'mention' || element.type === 'link') {
                return inlineToHtml(element);
            }

            const body = (element.children as InlineNode[]).map(inlineToHtml).join('');
            if (element.type === 'code_block') return `<pre><code>${body}</code></pre>`;
            return `<p>${body || '<br />'}</p>`;
        })
        .join('');
};

const withMarkdown = (editor: Editor): Editor => {
    const { insertText } = editor;

    editor.insertText = (text) => {
        insertText(text);
        if (text !== ' ' && text !== '\n' && text !== '`') return;

        const { selection } = editor;
        if (!selection || !Range.isCollapsed(selection)) return;

        const [blockEntry] = Editor.nodes(editor, {
            match: (n) =>
                SlateElement.isElement(n) &&
                ((n as { type?: string }).type === 'paragraph' ||
                    (n as { type?: string }).type === 'code_block'),
        });

        if (!blockEntry) return;

        const [block, path] = blockEntry;
        if (!SlateElement.isElement(block)) return;

        const textContent = Node.string(block);
        if (text === '\n' && textContent === '```') {
            Transforms.select(editor, Editor.range(editor, path));
            Transforms.delete(editor);
            Transforms.setNodes(editor, { type: 'code_block' } as any, {
                match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
            });
            return;
        }

        const shortcuts: Array<[string, 'bold' | 'italic' | 'strike' | 'code']> = [
            ['**', 'bold'],
            ['*', 'italic'],
            ['~~', 'strike'],
            ['`', 'code'],
        ];

        for (const [token, mark] of shortcuts) {
            const end = selection.anchor;
            const start = Editor.before(editor, end, {
                distance: token.length + 1,
                unit: 'character',
            });
            if (!start) continue;
            const range = { anchor: start, focus: end };
            const segment = Editor.string(editor, range);
            if (!segment.startsWith(token) || !segment.endsWith(token)) continue;
            const inner = segment.slice(token.length, -token.length);
            if (!inner) continue;

            Transforms.select(editor, range);
            Transforms.insertText(editor, inner, { at: range });
            Editor.addMark(editor, mark, true);
            return;
        }
    };

    return editor;
};

const withMentions = (editor: Editor): Editor => {
    const { isInline, isVoid } = editor;
    editor.isInline = (element) =>
        (SlateElement.isElement(element) && (element as { type?: string }).type === 'mention') ||
        isInline(element);
    editor.isVoid = (element) =>
        (SlateElement.isElement(element) && (element as { type?: string }).type === 'mention') ||
        isVoid(element);
    return editor;
};

const withEmoji = (editor: Editor): Editor => {
    const { insertText } = editor;
    editor.insertText = (text) => {
        if (text === ' ') {
            const { selection } = editor;
            if (selection && Range.isCollapsed(selection)) {
                const start = Editor.before(editor, selection.anchor, { unit: 'word' });
                if (start) {
                    const range = Editor.range(editor, start, selection.anchor);
                    const word = Editor.string(editor, range);
                    if (/^:[a-zA-Z0-9_+-]+:$/.test(word)) {
                        const shortcode = word.slice(1, -1);
                        const match = EMOJI_BY_SHORTCODE.get(shortcode);
                        if (match) {
                            Transforms.select(editor, range);
                            Transforms.insertText(editor, match);
                        }
                    }
                }
            }
        }
        insertText(text);
    };
    return editor;
};

const withLinks = (editor: Editor): Editor => {
    const { insertText } = editor;
    editor.insertText = (text) => {
        insertText(text);
        if (text !== ' ') return;

        const { selection } = editor;
        if (!selection || !Range.isCollapsed(selection)) return;
        const start = Editor.before(editor, selection.anchor, { unit: 'word' });
        if (!start) return;
        const range = Editor.range(editor, start, selection.anchor);
        const word = Editor.string(editor, range).trim();
        if (!/^https?:\/\//.test(word)) return;

        Transforms.wrapNodes(
            editor,
            { type: 'link', href: word, children: [{ text: word }] } as any,
            { at: range, split: true, match: (n) => Text.isText(n) }
        );
    };
    return editor;
};

const MentionElementView = ({
    attributes,
    children,
    element,
}: {
    attributes: Record<string, unknown>;
    children: ReactNode;
    element: MentionElement;
}) => {
    return (
        <span
            {...attributes}
            contentEditable={false}
            style={{
                padding: '1px 6px',
                borderRadius: 999,
                margin: '0 1px',
                background: 'var(--accent-muted)',
                color: 'var(--text-primary)',
                fontSize: 13,
            }}
            data-kind={element.mentionKind}
            data-id={element.id}
        >
            {element.label}
            {children}
        </span>
    );
};

const ElementRenderer = (props: {
    attributes: Record<string, unknown>;
    children: ReactNode;
    element: CustomElement;
}) => {
    const { attributes, children, element } = props;
    switch (element.type) {
        case 'mention':
            return (
                <MentionElementView attributes={attributes} children={children} element={element} />
            );
        case 'code_block':
            return (
                <pre {...attributes}>
                    <code>{children}</code>
                </pre>
            );
        case 'link':
            return (
                <a
                    {...attributes}
                    href={element.href}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent-primary)' }}
                >
                    {children}
                </a>
            );
        default:
            return <p {...attributes}>{children}</p>;
    }
};

const LeafRenderer = ({
    attributes,
    children,
    leaf,
}: {
    attributes: Record<string, unknown>;
    children: ReactNode;
    leaf: CustomText;
}) => {
    let content = children;
    if (leaf.bold) content = <strong>{content}</strong>;
    if (leaf.italic) content = <em>{content}</em>;
    if (leaf.strike) content = <del>{content}</del>;
    if (leaf.code) content = <code>{content}</code>;
    return <span {...attributes}>{content}</span>;
};

type ComposerMark = 'bold' | 'italic' | 'strike' | 'code';

const FORMAT_MARKS: Array<{
    mark: ComposerMark;
    label: string;
    title: string;
    style?: Record<string, string | number>;
}> = [
    { mark: 'bold', label: 'B', title: 'Bold', style: { fontWeight: 700 } },
    { mark: 'italic', label: 'I', title: 'Italic', style: { fontStyle: 'italic' } },
    {
        mark: 'strike',
        label: 'S',
        title: 'Strikethrough',
        style: { textDecoration: 'line-through' },
    },
    { mark: 'code', label: '</>', title: 'Inline code', style: { fontFamily: 'monospace' } },
];

const isComposerMarkActive = (editor: Editor, mark: ComposerMark): boolean => {
    const marks = Editor.marks(editor) as Record<string, unknown> | null;
    return marks ? marks[mark] === true : false;
};

const FormatMarkButton = ({
    mark,
    label,
    title,
    style,
}: {
    mark: ComposerMark;
    label: string;
    title: string;
    style?: Record<string, string | number>;
}) => {
    const editor = useSlate();
    const active = isComposerMarkActive(editor, mark);
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={active}
            // onMouseDown + preventDefault keeps the editor selection so the
            // mark toggles the currently selected text instead of losing focus.
            onMouseDown={(event) => {
                event.preventDefault();
                if (isComposerMarkActive(editor, mark)) {
                    Editor.removeMark(editor, mark);
                } else {
                    Editor.addMark(editor, mark, true);
                }
            }}
            style={{
                minWidth: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid var(--border-default)',
                background: active ? 'var(--accent-muted)' : 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 13,
                cursor: 'pointer',
                ...style,
            }}
        >
            {label}
        </button>
    );
};

// Surfaces the current room's end-to-end encryption status next to the
// composer. Driven by the `m.room.encryption` state event so it stays in sync
// if encryption is enabled while the room is open. Click toggles a short
// plain-language explanation.
const RoomEncryptionIndicator = ({ room }: { room: Room }) => {
    const encryptionEvent = useStateEvent(room, StateEvent.RoomEncryption);
    const encrypted = Boolean(encryptionEvent);
    const [explainOpen, setExplainOpen] = useState(false);

    return (
        <div style={{ position: 'relative', display: 'inline-flex', marginRight: 8 }}>
            <button
                type="button"
                onClick={() => setExplainOpen((open) => !open)}
                aria-label={
                    encrypted
                        ? 'Room is end-to-end encrypted. Show what this means.'
                        : 'Room is not encrypted. Show what this means.'
                }
                aria-expanded={explainOpen}
                title={encrypted ? 'End-to-end encrypted' : 'Not encrypted'}
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    fontSize: 15,
                    lineHeight: 1,
                    opacity: encrypted ? 1 : 0.6,
                    cursor: 'pointer',
                }}
            >
                {encrypted ? '🔒' : '🔓'}
            </button>
            {explainOpen ? (
                <div
                    role="tooltip"
                    style={{
                        position: 'absolute',
                        bottom: 38,
                        left: 0,
                        width: 240,
                        zIndex: 5,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-secondary)',
                        fontSize: 12,
                        lineHeight: 1.4,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                    }}
                >
                    {encrypted
                        ? 'End-to-end encrypted. Only people in this room can read these messages — not even the server can.'
                        : 'Not encrypted. Messages are stored unencrypted on the server. Enable encryption in room settings for private conversations.'}
                </div>
            ) : null}
        </div>
    );
};

export const MessageComposer = ({
    roomId,
    target,
    initialMarkdown,
    placeholder = 'Message',
    onSent,
}: MessageComposerProps) => {
    const editor = useMemo(
        () =>
            withLinks(
                withEmoji(withMentions(withMarkdown(withReact(withHistory(createEditor())))))
            ),
        []
    );
    const [value, setValue] = useState<CustomElement[]>(() => {
        const seed = initialMarkdown ?? loadDraft(roomId);
        return seed ? [{ type: 'paragraph', children: [{ text: seed }] }] : initialValue;
    });
    // Slate's <Slate initialValue> is only read on mount, so setValue alone never
    // resets the editor's visible content — clear the node tree imperatively.
    const clearComposer = useCallback(() => {
        if (!editor.selection) Transforms.select(editor, Editor.start(editor, []));
        resetEditor(editor);
        setValue(initialValue);
        saveDraft(roomId, '');
    }, [editor, roomId]);
    // Replace the editor's entire contents with plain text (drafts, quick
    // actions, edit prefills). Also imperative for the same reason.
    const setComposerText = useCallback(
        (text: string) => {
            if (!editor.selection) Transforms.select(editor, Editor.start(editor, []));
            resetEditor(editor);
            if (text) {
                Transforms.select(editor, Editor.start(editor, []));
                Transforms.insertText(editor, text);
            }
            setValue(editor.children as CustomElement[]);
        },
        [editor]
    );
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [triggerRange, setTriggerRange] = useState<Range | null>(null);
    const [triggerType, setTriggerType] = useState<MentionKind | null>(null);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [sending, setSending] = useState(false);
    const [hideDialogOpen, setHideDialogOpen] = useState(false);
    const [stegoAttachment, setStegoAttachment] = useState<File | null>(null);
    const [featureMenuOpen, setFeatureMenuOpen] = useState(false);
    const [isMobileMenu, setIsMobileMenu] = useState(false);
    const [recentActions, setRecentActions] = useState<string[]>([]);
    const [voteEnabled, setVoteEnabled] = useState(false);
    const [voteDurationHours, setVoteDurationHours] = useState(24);
    const [voiceAttachment, setVoiceAttachment] = useState<File | null>(null);
    const [voiceRecording, setVoiceRecording] = useState(false);
    const [voiceRecordingSupported, setVoiceRecordingSupported] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [signatureEnabled, setSignatureEnabled] = useState(false);
    const [commandEnabled, setCommandEnabled] = useState(false);
    const [selectedCommand, setSelectedCommand] = useState<CommandPreset | null>(null);
    const [scheduledEnabled, setScheduledEnabled] = useState(false);
    const [scheduleDelayHours, setScheduleDelayHours] = useState(1);
    const [encryptionPresetEnabled, setEncryptionPresetEnabled] = useState(false);
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const [slowmodeNotice, setSlowmodeNotice] = useState<string | null>(null);
    const lastSentTsRef = useRef<number | null>(null);
    const [commandPayload, setCommandPayload] = useAtom(composerCommandPayloadAtom);
    const privacyToolsSettings = useAtomValue(privacyToolsSettingsAtom);

    const menuRef = useRef<HTMLDivElement | null>(null);
    const emojiPickerRef = useRef<HTMLDivElement | null>(null);
    const featureMenuRef = useRef<HTMLDivElement | null>(null);
    const attachmentInputRef = useRef<HTMLInputElement | null>(null);
    const voiceInputRef = useRef<HTMLInputElement | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const recorderChunksRef = useRef<Blob[]>([]);
    const recorderStreamRef = useRef<MediaStream | null>(null);
    const editableRef = useRef<HTMLDivElement | null>(null);
    const attachPhoto = useAttachPhoto({ setAttachments, attachmentInputRef });

    const { data: members } = useRoomMembers(roomId);
    const { data: spaces } = useNavigationSpaceTree();
    const sendTyping = useSendTyping(roomId);
    const { sendRichText, sendMedia } = useSendMessage(roomId);
    const editMessage = useEditMessage(roomId);
    const matrixClient = useMatrixClient();
    const room = useMemo(() => matrixClient.getRoom?.(roomId) ?? undefined, [matrixClient, roomId]);

    const draftRoomRef = useRef(roomId);

    useEffect(() => {
        if (!initialMarkdown) return;
        setComposerText(initialMarkdown);
    }, [initialMarkdown, setComposerText]);

    useEffect(() => {
        if (!commandPayload) return;
        if (commandPayload.roomId && commandPayload.roomId !== roomId) return;
        setComposerText(commandPayload.text);
        setCommandPayload(null);
    }, [commandPayload, roomId, setCommandPayload, setComposerText]);

    // Persist the draft for whichever room is currently loaded in the editor.
    useEffect(() => {
        saveDraft(draftRoomRef.current, toPlainText(value));
    }, [value]);

    // Switching rooms reuses this component instance, so swap the editor
    // contents to the destination room's saved draft.
    useEffect(() => {
        if (draftRoomRef.current === roomId) return;
        draftRoomRef.current = roomId;
        setComposerText(loadDraft(roomId));
    }, [roomId, setComposerText]);

    const insertEmoji = useCallback(
        (emoji: string) => {
            ReactEditor.focus(editor as ReactEditor);
            Transforms.insertText(editor, emoji);
            setEmojiPickerOpen(false);
        },
        [editor]
    );

    useDismissOnOutsideOrEscape(featureMenuOpen, featureMenuRef, () => setFeatureMenuOpen(false));
    useDismissOnOutsideOrEscape(emojiPickerOpen, emojiPickerRef, () => setEmojiPickerOpen(false));
    useDismissOnOutsideOrEscape(hideDialogOpen, null, () => setHideDialogOpen(false));

    useEffect(() => {
        const query = window.matchMedia('(max-width: 768px)');
        const sync = () => setIsMobileMenu(query.matches);
        sync();
        query.addEventListener('change', sync);
        return () => query.removeEventListener('change', sync);
    }, []);

    useEffect(() => {
        const onShortcut = (event: globalThis.KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setFeatureMenuOpen((open) => !open);
            }
        };
        window.addEventListener('keydown', onShortcut);
        return () => window.removeEventListener('keydown', onShortcut);
    }, []);

    useEffect(() => {
        setVoiceRecordingSupported(
            typeof window !== 'undefined' &&
                !!navigator.mediaDevices?.getUserMedia &&
                typeof MediaRecorder !== 'undefined'
        );
        return () => {
            recorderRef.current?.stop();
            recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    const recordRecentAction = useCallback((actionLabel: string) => {
        setRecentActions((current) =>
            [actionLabel, ...current.filter((item) => item !== actionLabel)].slice(0, 3)
        );
    }, []);

    const startVoiceRecording = useCallback(async () => {
        if (!voiceRecordingSupported || voiceRecording) return;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        recorderChunksRef.current = [];
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) recorderChunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
            const voiceBlob = new Blob(recorderChunksRef.current, {
                type: recorder.mimeType || 'audio/webm',
            });
            const extension = voiceBlob.type.includes('ogg')
                ? 'ogg'
                : voiceBlob.type.includes('mp4')
                ? 'm4a'
                : 'webm';
            const voiceFile = new File([voiceBlob], `voice-note-${Date.now()}.${extension}`, {
                type: voiceBlob.type,
            });
            setVoiceAttachment(voiceFile);
            setVoiceEnabled(true);
            recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
            recorderStreamRef.current = null;
            recorderRef.current = null;
            setVoiceRecording(false);
        };
        recorderRef.current = recorder;
        recorderStreamRef.current = stream;
        recorder.start();
        setVoiceRecording(true);
    }, [voiceRecording, voiceRecordingSupported]);

    const stopVoiceRecording = useCallback(() => {
        if (!voiceRecording) return;
        recorderRef.current?.stop();
    }, [voiceRecording]);

    const roomIsGovernance = useMemo(() => /gov|vote|proposal|council|dao/i.test(roomId), [roomId]);
    const primaryTier2Actions = useMemo(
        () =>
            roomIsGovernance
                ? ['Poll / vote', 'Steganography', 'Slash command']
                : ['Steganography', 'Poll / vote', 'Slash command'],
        [roomIsGovernance]
    );
    const intentSuggestions = useMemo(() => {
        const text = toPlainText(value).toLowerCase();
        const suggestionsSet: string[] = [];
        if (text.includes('vote') || text.includes('poll')) suggestionsSet.push('Poll / vote');
        if (text.includes('secret') || text.includes('hide')) suggestionsSet.push('Steganography');
        if (text.startsWith('/')) suggestionsSet.push('Slash command');
        if (text.includes('sign')) suggestionsSet.push('Signed message preset');
        return suggestionsSet;
    }, [value]);

    const roomSuggestions = useMemo(() => {
        const flattened: Suggestion[] = [];
        const walk = (nodes: typeof spaces) => {
            nodes.forEach((node) => {
                flattened.push({ id: node.roomId, label: node.roomId, kind: 'room' });
                walk(node.children);
            });
        };
        walk(spaces);
        return flattened;
    }, [spaces]);

    const memberSuggestions = useMemo<Suggestion[]>(
        () =>
            members.map((member) => ({
                id: member.userId,
                label: member.name || member.userId,
                kind: 'user',
            })),
        [members]
    );

    const emojiSuggestions = useMemo<Suggestion[]>(
        () =>
            emojis.map((emoji) => ({
                id: emoji.shortcode,
                label: `${emoji.unicode} :${emoji.shortcode}:`,
                kind: 'emoji',
            })),
        []
    );

    const runAutocomplete = useCallback(() => {
        const { selection } = editor;
        if (!selection || !Range.isCollapsed(selection)) {
            setTriggerRange(null);
            setTriggerType(null);
            setSuggestions([]);
            return;
        }

        const point = selection.anchor;
        const start = Editor.before(editor, point, { unit: 'line' }) ?? Editor.start(editor, []);
        const range = Editor.range(editor, start, point);
        const text = Editor.string(editor, range);

        const match = text.match(/(^|\s)([@#:])([^\s@#:]*)$/);
        if (!match) {
            setTriggerRange(null);
            setTriggerType(null);
            setSuggestions([]);
            return;
        }

        const trigger = match[2];
        const query = match[3] ?? '';
        const offset = text.length - (query.length + 1);
        const triggerPoint = Editor.before(editor, point, {
            distance: text.length - offset,
            unit: 'character',
        });
        if (!triggerPoint) return;

        const nextRange: Range = { anchor: triggerPoint, focus: point };
        setTriggerRange(nextRange);

        let dataset: Suggestion[] = [];
        let kind: MentionKind = 'user';
        if (trigger === '@') {
            dataset = memberSuggestions;
            kind = 'user';
        } else if (trigger === '#') {
            dataset = roomSuggestions;
            kind = 'room';
        } else {
            dataset = emojiSuggestions;
            kind = 'emoji';
        }

        setTriggerType(kind);
        const filtered = dataset
            .filter((item) => fuzzyMatch(item.label, query))
            .slice(0, MAX_SUGGESTIONS);
        setSuggestions(filtered);
        setActiveIndex(0);
    }, [editor, emojiSuggestions, memberSuggestions, roomSuggestions]);

    useEffect(() => {
        void sendTyping(toPlainText(value).length > 0);
    }, [sendTyping, value]);

    const selectSuggestion = useCallback(
        (suggestion: Suggestion) => {
            if (!triggerRange) return;
            Transforms.select(editor, triggerRange);
            Transforms.delete(editor);
            if (suggestion.kind === 'emoji') {
                const emoji = EMOJI_BY_SHORTCODE.get(suggestion.id);
                Transforms.insertText(editor, emoji ?? suggestion.label);
            } else {
                const mention: MentionElement = {
                    type: 'mention',
                    mentionKind: suggestion.kind,
                    id: suggestion.id,
                    label: suggestion.kind === 'room' ? `#${suggestion.label}` : suggestion.label,
                    children: [{ text: '' }],
                };
                Transforms.insertNodes(editor, mention as any);
                Transforms.insertText(editor, ' ');
            }
            setTriggerRange(null);
            setTriggerType(null);
            setSuggestions([]);
        },
        [editor, triggerRange]
    );

    const sendCurrentMessage = useCallback(async () => {
        const plainBody = toPlainText(value);
        if (!plainBody && attachments.length === 0 && !voiceAttachment) return;
        if (plainBody.length > MAX_MESSAGE_LENGTH) return;

        // Slow mode: throttle non-exempt senders per the room's co.bmc.slowmode
        // config. Edits aren't new posts, so they're never throttled.
        if (room && target?.mode !== 'edit') {
            const slowmodeContent = room.currentState
                .getStateEvents(SLOWMODE_STATE_EVENT_TYPE as never, '')
                ?.getContent<Record<string, unknown>>();
            const verdict = evaluateSlowmode({
                config: parseSlowmodeConfig(slowmodeContent),
                lastSentTs: lastSentTsRef.current,
                now: Date.now(),
                userPowerLevel:
                    room.getMember(matrixClient.getUserId() ?? '')?.powerLevel ?? 0,
            });
            if (!verdict.allowed) {
                setSlowmodeNotice(
                    `Slow mode is on — wait ${Math.ceil(verdict.retryAfterMs / 1000)}s before sending again.`
                );
                return;
            }
            lastSentTsRef.current = Date.now();
            setSlowmodeNotice(null);
        }

        setSending(true);
        try {
            const htmlBody = toHtml(value);
            const signatureSuffix = signatureEnabled ? '\n— signed via Blackout' : '';
            const commandProcessedBody =
                commandEnabled && selectedCommand
                    ? executeCommandTemplate(selectedCommand, plainBody)
                    : plainBody;
            let bodyToSend = `${commandProcessedBody}${signatureSuffix}`.trim();
            let formattedBody = htmlBody;
            if (privacyToolsSettings.linkSanitizeEnabled) {
                bodyToSend = sanitizeUrlsInText(bodyToSend);
                formattedBody = sanitizeFormattedBody(formattedBody);
            }

            if (target?.mode === 'edit' && target.eventId) {
                await editMessage(target.eventId, bodyToSend);
            } else {
                const content: Record<string, unknown> = {
                    msgtype: 'm.text',
                    body: bodyToSend,
                    format: 'org.matrix.custom.html',
                    formatted_body: formattedBody,
                };
                if (voteEnabled) {
                    content['co.blackout.poll'] = {
                        question: plainBody || 'Untitled poll',
                        options: ['Yes', 'No'],
                        duration_hours: voteDurationHours,
                    };
                }
                if (signatureEnabled) {
                    content['co.blackout.signature'] = { enabled: true };
                }
                if (
                    scheduledEnabled &&
                    attachments.length === 0 &&
                    !voiceAttachment &&
                    !stegoAttachment
                ) {
                    // Hand the message to the server, which persists it and
                    // delivers it at deliverAt even if this client is closed.
                    const deliverAt = new Date(
                        Date.now() + scheduleDelayHours * 60 * 60 * 1000
                    ).toISOString();
                    await createScheduledMessage({
                        matrixRoomId: roomId,
                        body: bodyToSend,
                        formattedBody,
                        deliverAt,
                    });
                    clearComposer();
                    setAttachments([]);
                    setVoiceAttachment(null);
                    setStegoAttachment(null);
                    setScheduledEnabled(false);
                    onSent?.();
                    await sendTyping(false);
                    return;
                }
                if (encryptionPresetEnabled) {
                    content['co.blackout.encryption'] = { preset: 'enhanced' };
                }
                if (commandEnabled && selectedCommand) {
                    content['co.blackout.command'] = {
                        id: selectedCommand.id,
                        template: selectedCommand.template,
                        executed: true,
                    };
                }

                if (target?.mode === 'reply' && target.eventId) {
                    content['m.relates_to'] = {
                        'm.in_reply_to': { event_id: target.eventId },
                    };
                }

                if (target?.mode === 'thread' && target.rootEventId) {
                    content['m.relates_to'] = {
                        rel_type: 'm.thread',
                        event_id: target.rootEventId,
                        is_falling_back: true,
                        'm.in_reply_to': {
                            event_id: target.rootEventId,
                        },
                    };
                }

                await sendRichText(content);
            }

            for (const file of attachments) {
                await sendMedia(file);
            }
            if (voiceAttachment) {
                await sendMedia(voiceAttachment);
            }

            if (stegoAttachment) {
                const mxcUrl = await uploadMedia(matrixClient, stegoAttachment);
                const image = await createImageBitmap(stegoAttachment);
                await (
                    matrixClient as unknown as {
                        sendEvent: (
                            rid: string,
                            type: string,
                            content: Record<string, unknown>
                        ) => Promise<unknown>;
                    }
                ).sendEvent(roomId, 'm.room.message', {
                    msgtype: 'm.image',
                    body: stegoAttachment.name,
                    url: mxcUrl,
                    info: {
                        mimetype: stegoAttachment.type,
                        size: stegoAttachment.size,
                        w: image.width,
                        h: image.height,
                    },
                    'co.blackout.stego': {
                        hidden: true,
                        algorithm: 'lsb-aes-256-cbc',
                        version: 1,
                    },
                });
            }

            clearComposer();
            setAttachments([]);
            setVoiceAttachment(null);
            setStegoAttachment(null);
            onSent?.();
            await sendTyping(false);
        } finally {
            setSending(false);
        }
    }, [
        attachments,
        clearComposer,
        commandEnabled,
        editMessage,
        encryptionPresetEnabled,
        matrixClient,
        onSent,
        privacyToolsSettings.linkSanitizeEnabled,
        room,
        roomId,
        scheduleDelayHours,
        scheduledEnabled,
        selectedCommand,
        sendMedia,
        sendRichText,
        sendTyping,
        signatureEnabled,
        stegoAttachment,
        target,
        value,
        voiceAttachment,
        voteDurationHours,
        voteEnabled,
    ]);

    const applyFeatureAction = useCallback(
        (actionLabel: string) => {
            recordRecentAction(actionLabel);
            if (actionLabel === 'Attach file' || actionLabel === 'Upload media') {
                void attachPhoto();
                return;
            }
            if (actionLabel === 'Quick voice note') {
                if (voiceRecordingSupported) {
                    if (voiceRecording) {
                        stopVoiceRecording();
                    } else {
                        void startVoiceRecording();
                    }
                } else {
                    voiceInputRef.current?.click();
                }
                return;
            }
            if (actionLabel === 'Steganography') {
                setHideDialogOpen(true);
                setFeatureMenuOpen(false);
                return;
            }
            if (actionLabel === 'Poll / vote') {
                setVoteEnabled((active) => !active);
                return;
            }
            if (actionLabel === 'Slash command') {
                setCommandEnabled(true);
                if (!selectedCommand) setSelectedCommand(COMMAND_PRESETS[0]);
                return;
            }
            if (actionLabel === 'Signed message preset') {
                setSignatureEnabled((active) => !active);
                return;
            }
            if (actionLabel === 'Scheduled send preset') {
                // Scheduled delivery is server-side and text-only; attachments
                // would be sent immediately, so don't offer it alongside them.
                if (attachments.length > 0 || voiceAttachment || stegoAttachment) return;
                setScheduledEnabled((active) => !active);
                return;
            }
            if (actionLabel === 'Encryption preset') {
                setEncryptionPresetEnabled((active) => !active);
            }
        },
        [
            attachPhoto,
            attachments,
            recordRecentAction,
            selectedCommand,
            startVoiceRecording,
            stegoAttachment,
            stopVoiceRecording,
            voiceAttachment,
            voiceRecording,
            voiceRecordingSupported,
        ]
    );

    const handleKeyDown = useCallback(
        async (event: KeyboardEvent<HTMLDivElement>) => {
            if (suggestions.length > 0) {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActiveIndex((valuePrev) => (valuePrev + 1) % suggestions.length);
                    return;
                }
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActiveIndex(
                        (valuePrev) => (valuePrev - 1 + suggestions.length) % suggestions.length
                    );
                    return;
                }
                if (event.key === 'Enter') {
                    event.preventDefault();
                    const selected = suggestions[activeIndex];
                    if (selected) selectSuggestion(selected);
                    return;
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    setSuggestions([]);
                    setTriggerRange(null);
                    setTriggerType(null);
                    return;
                }
            }

            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                await sendCurrentMessage();
            }
        },
        [activeIndex, selectSuggestion, sendCurrentMessage, suggestions]
    );

    const prepareAttachments = useCallback(
        async (files: File[]): Promise<File[]> => {
            if (!privacyToolsSettings.exifStripEnabled) return files;
            return Promise.all(files.map((file) => stripImageMetadata(file)));
        },
        [privacyToolsSettings.exifStripEnabled]
    );

    const onDropFiles = useCallback(
        async (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            if (!event.dataTransfer.files.length) return;
            const prepared = await prepareAttachments(Array.from(event.dataTransfer.files));
            setAttachments((prev) => [...prev, ...prepared]);
        },
        [prepareAttachments]
    );

    const onPaste = useCallback(
        async (event: ClipboardEvent<HTMLDivElement>) => {
            if (!event.clipboardData.files.length) return;
            const prepared = await prepareAttachments(Array.from(event.clipboardData.files));
            setAttachments((prev) => [...prev, ...prepared]);
        },
        [prepareAttachments]
    );

    const menuPosition = useMemo(() => {
        if (!triggerRange) return null;
        try {
            const domRange = ReactEditor.toDOMRange(editor as ReactEditor, triggerRange);
            const rect = domRange.getBoundingClientRect();
            return { top: rect.bottom + 8, left: rect.left };
        } catch {
            return null;
        }
    }, [editor, triggerRange]);

    const plainTextLength = useMemo(() => toPlainText(value).length, [value]);
    const overLimit = plainTextLength > MAX_MESSAGE_LENGTH;

    return (
        <section
            style={{
                borderTop: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                padding: 10,
                position: 'relative',
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDropFiles}
        >
            <HideMessageDialog
                open={hideDialogOpen}
                onClose={() => setHideDialogOpen(false)}
                onEncoded={(file) => setStegoAttachment(file)}
            />
            {target?.mode && target.mode !== 'new' ? (
                <div
                    style={{
                        marginBottom: 8,
                        borderLeft: '2px solid var(--accent-primary)',
                        paddingLeft: 8,
                        color: 'var(--text-secondary)',
                    }}
                >
                    <strong>{target.mode === 'edit' ? 'Editing message' : 'Replying'}</strong>
                    {target.quotedText ? <div>{target.quotedText}</div> : null}
                </div>
            ) : null}

            <Slate
                editor={editor as ReactEditor}
                initialValue={value as any}
                onChange={(nextValue) => {
                    setValue(nextValue as CustomElement[]);
                    runAutocomplete();
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-start',
                        marginBottom: 6,
                        position: 'relative',
                    }}
                >
                    <input
                        ref={attachmentInputRef}
                        type="file"
                        multiple
                        style={{ display: 'none' }}
                        onChange={async (event) => {
                            const input = event.currentTarget;
                            if (!input.files) return;
                            const files = Array.from(input.files);
                            input.value = '';
                            const prepared = await prepareAttachments(files);
                            setAttachments((prev) => [...prev, ...prepared]);
                        }}
                    />
                    <input
                        ref={voiceInputRef}
                        type="file"
                        accept="audio/*"
                        style={{ display: 'none' }}
                        onChange={(event) => {
                            const voiceFile = event.currentTarget.files?.[0];
                            if (!voiceFile) return;
                            setVoiceAttachment(voiceFile);
                            setVoiceEnabled(true);
                            event.currentTarget.value = '';
                        }}
                    />
                    {room ? <RoomEncryptionIndicator room={room} /> : null}
                    <button
                        type="button"
                        onClick={() => setFeatureMenuOpen((open) => !open)}
                        aria-label="Open composer features"
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 999,
                            border: '1px solid var(--border-default)',
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            fontSize: 18,
                            lineHeight: 1,
                        }}
                    >
                        +
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setHideDialogOpen(true);
                            setFeatureMenuOpen(false);
                        }}
                        aria-label="Open steganography toolbox"
                        style={{
                            marginLeft: 8,
                            height: 32,
                            borderRadius: 999,
                            border: '1px solid var(--border-default)',
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '0 12px',
                        }}
                    >
                        Stego
                    </button>
                    {featureMenuOpen ? (
                        <div
                            ref={featureMenuRef}
                            style={{
                                position: isMobileMenu ? 'fixed' : 'absolute',
                                top: isMobileMenu ? 'auto' : 38,
                                bottom: isMobileMenu ? 0 : 'auto',
                                left: isMobileMenu ? 0 : 0,
                                width: isMobileMenu ? '100%' : 280,
                                border: '1px solid var(--border-default)',
                                borderRadius: isMobileMenu ? '12px 12px 0 0' : 10,
                                background: 'var(--bg-input)',
                                zIndex: 10,
                                padding: 10,
                                display: 'grid',
                                gap: 10,
                                maxHeight: isMobileMenu ? '65vh' : 'none',
                                overflowY: isMobileMenu ? 'auto' : 'visible',
                            }}
                        >
                            <div style={{ display: 'grid', gap: 6 }}>
                                <strong style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    Tier 1 • Common
                                </strong>
                                <button
                                    type="button"
                                    onClick={() => applyFeatureAction('Attach file')}
                                >
                                    Attach file
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applyFeatureAction('Upload media')}
                                >
                                    Upload media
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applyFeatureAction('Quick voice note')}
                                >
                                    {voiceRecordingSupported
                                        ? voiceRecording
                                            ? 'Stop voice recording'
                                            : 'Record voice note'
                                        : 'Quick voice note'}
                                </button>
                            </div>
                            <div style={{ display: 'grid', gap: 6 }}>
                                <strong style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    Tier 2 • Secondary
                                </strong>
                                {primaryTier2Actions.map((action) => (
                                    <button
                                        key={action}
                                        type="button"
                                        onClick={() => applyFeatureAction(action)}
                                    >
                                        {action}
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'grid', gap: 6 }}>
                                <strong style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    Tier 3 • Advanced
                                </strong>
                                <button
                                    type="button"
                                    onClick={() => applyFeatureAction('Signed message preset')}
                                >
                                    Signed message preset
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applyFeatureAction('Scheduled send preset')}
                                >
                                    Scheduled send preset
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applyFeatureAction('Encryption preset')}
                                >
                                    Encryption preset
                                </button>
                            </div>
                            {recentActions.length > 0 ? (
                                <div style={{ display: 'grid', gap: 4 }}>
                                    <strong
                                        style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                                    >
                                        Recent
                                    </strong>
                                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                        {recentActions.join(' • ')}
                                    </span>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        marginBottom: 6,
                    }}
                    aria-label="Text formatting"
                >
                    {FORMAT_MARKS.map((format) => (
                        <FormatMarkButton key={format.mark} {...format} />
                    ))}
                    <div ref={emojiPickerRef} style={{ position: 'relative', marginLeft: 'auto' }}>
                        <button
                            type="button"
                            aria-label="Insert emoji"
                            aria-expanded={emojiPickerOpen}
                            onClick={() => setEmojiPickerOpen((open) => !open)}
                            style={{
                                minWidth: 28,
                                height: 28,
                                borderRadius: 6,
                                border: '1px solid var(--border-default)',
                                background: emojiPickerOpen
                                    ? 'var(--accent-muted)'
                                    : 'var(--bg-input)',
                                cursor: 'pointer',
                                fontSize: 15,
                                lineHeight: 1,
                            }}
                        >
                            😊
                        </button>
                        {emojiPickerOpen ? (
                            <EmojiPicker
                                customEmoji={{}}
                                recents={[]}
                                onSelect={insertEmoji}
                                onClose={() => setEmojiPickerOpen(false)}
                            />
                        ) : null}
                    </div>
                </div>

                <div
                    ref={editableRef}
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 10,
                        padding: '8px 10px',
                        minHeight: 76,
                    }}
                >
                    <Editable
                        placeholder={placeholder}
                        renderElement={(props) => <ElementRenderer {...(props as any)} />}
                        renderLeaf={(props) => <LeafRenderer {...(props as any)} />}
                        onKeyDown={(event) => void handleKeyDown(event)}
                        onPaste={onPaste}
                        spellCheck
                        autoFocus
                    />
                </div>
                {intentSuggestions.length > 0 ? (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {intentSuggestions.map((suggestion) => (
                            <button
                                key={suggestion}
                                type="button"
                                onClick={() => applyFeatureAction(suggestion)}
                                style={{
                                    border: '1px dashed var(--border-default)',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                    fontSize: 12,
                                    background: 'transparent',
                                }}
                            >
                                Suggestion: {suggestion}
                            </button>
                        ))}
                    </div>
                ) : null}
                {commandEnabled ? (
                    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            Slash command
                        </label>
                        <select
                            value={selectedCommand?.id ?? ''}
                            onChange={(event) =>
                                setSelectedCommand(
                                    COMMAND_PRESETS.find(
                                        (preset) => preset.id === event.currentTarget.value
                                    ) ?? null
                                )
                            }
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                padding: '4px 8px',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            {COMMAND_PRESETS.map((preset) => (
                                <option key={preset.id} value={preset.id}>
                                    {preset.label}
                                </option>
                            ))}
                        </select>
                    </div>
                ) : null}

                {attachments.length > 0 ||
                stegoAttachment ||
                voteEnabled ||
                voiceEnabled ||
                signatureEnabled ||
                commandEnabled ||
                scheduledEnabled ||
                encryptionPresetEnabled ? (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {attachments.map((file, idx) => (
                            <span
                                key={`${file.name}-${idx}`}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                    fontSize: 12,
                                    display: 'inline-flex',
                                    gap: 6,
                                    alignItems: 'center',
                                }}
                            >
                                Attach: {file.name}
                                <button
                                    type="button"
                                    aria-label={`Remove ${file.name}`}
                                    onClick={() =>
                                        setAttachments((current) =>
                                            current.filter((_, currentIdx) => currentIdx !== idx)
                                        )
                                    }
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                        {stegoAttachment ? (
                            <span
                                style={{
                                    border: '1px solid var(--accent-primary)',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                    fontSize: 12,
                                    display: 'inline-flex',
                                    gap: 6,
                                    alignItems: 'center',
                                }}
                            >
                                Stego: image ready
                                <button
                                    type="button"
                                    onClick={() => setStegoAttachment(null)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        ) : null}
                        {voteEnabled ? (
                            <span
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                    fontSize: 12,
                                    display: 'inline-flex',
                                    gap: 6,
                                    alignItems: 'center',
                                }}
                            >
                                Vote: 2 options • {voteDurationHours}h
                                <button
                                    type="button"
                                    onClick={() =>
                                        setVoteDurationHours((current) =>
                                            current === 24 ? 48 : 24
                                        )
                                    }
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--accent-primary)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setVoteEnabled(false)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        ) : null}
                        {voiceEnabled ? (
                            <span
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                    fontSize: 12,
                                    display: 'inline-flex',
                                    gap: 6,
                                    alignItems: 'center',
                                }}
                            >
                                Voice: {voiceAttachment?.name ?? 'attached'}
                                <button
                                    type="button"
                                    onClick={() => voiceInputRef.current?.click()}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--accent-primary)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Replace
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setVoiceEnabled(false);
                                        setVoiceAttachment(null);
                                    }}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        ) : null}
                        {commandEnabled ? (
                            <span
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                    fontSize: 12,
                                    display: 'inline-flex',
                                    gap: 6,
                                    alignItems: 'center',
                                }}
                            >
                                Command: {selectedCommand?.label ?? 'enabled'}
                                <button
                                    type="button"
                                    onClick={() => setCommandEnabled(false)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        ) : null}
                        {signatureEnabled ? (
                            <span
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                    fontSize: 12,
                                    display: 'inline-flex',
                                    gap: 6,
                                    alignItems: 'center',
                                }}
                            >
                                Signature: enabled
                                <button
                                    type="button"
                                    onClick={() => setSignatureEnabled(false)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        ) : null}
                        {scheduledEnabled ? (
                            <span
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                    fontSize: 12,
                                    display: 'inline-flex',
                                    gap: 6,
                                    alignItems: 'center',
                                }}
                            >
                                Schedule: +{scheduleDelayHours}h
                                <button
                                    type="button"
                                    onClick={() =>
                                        setScheduleDelayHours((hours) => (hours === 1 ? 4 : 1))
                                    }
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--accent-primary)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setScheduledEnabled(false)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        ) : null}
                        {encryptionPresetEnabled ? (
                            <span
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                    fontSize: 12,
                                    display: 'inline-flex',
                                    gap: 6,
                                    alignItems: 'center',
                                }}
                            >
                                Encryption: preset
                                <button
                                    type="button"
                                    onClick={() => setEncryptionPresetEnabled(false)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        ) : null}
                    </div>
                ) : null}

                {slowmodeNotice ? (
                    <div
                        role="status"
                        style={{
                            marginTop: 8,
                            fontSize: 12,
                            color: 'var(--color-danger, #e5484d)',
                        }}
                    >
                        {slowmodeNotice}
                    </div>
                ) : null}

                <div
                    style={{
                        marginTop: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        Enter to send · Shift+Enter for newline
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {plainTextLength > MAX_MESSAGE_LENGTH * 0.8 ? (
                            <span
                                style={{
                                    fontSize: 12,
                                    color: overLimit
                                        ? 'var(--color-danger, #e5484d)'
                                        : 'var(--text-muted)',
                                }}
                            >
                                {plainTextLength}/{MAX_MESSAGE_LENGTH}
                            </span>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => void sendCurrentMessage()}
                            disabled={sending || overLimit}
                            title={overLimit ? 'Message exceeds the maximum length' : undefined}
                            style={{
                                border: '1px solid var(--border-default)',
                                background: 'var(--accent-primary)',
                                color: 'var(--bg-surface)',
                                borderRadius: 8,
                                padding: '6px 10px',
                                opacity: sending || overLimit ? 0.6 : 1,
                            }}
                        >
                            {sending ? 'Sending…' : 'Send'}
                        </button>
                    </div>
                </div>
            </Slate>

            {menuPosition && suggestions.length > 0 ? (
                <div
                    ref={menuRef}
                    style={{
                        position: 'fixed',
                        top: menuPosition.top,
                        left: menuPosition.left,
                        zIndex: 30,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-input)',
                        borderRadius: 8,
                        minWidth: 200,
                        overflow: 'hidden',
                    }}
                >
                    {suggestions.map((suggestion, idx) => (
                        <button
                            key={`${suggestion.kind}-${suggestion.id}`}
                            type="button"
                            onClick={() => selectSuggestion(suggestion)}
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                border: 'none',
                                background:
                                    idx === activeIndex ? 'var(--accent-muted)' : 'transparent',
                                color: 'var(--text-primary)',
                                padding: '6px 8px',
                                cursor: 'pointer',
                            }}
                        >
                            <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>
                                {triggerType === 'user' ? '@' : triggerType === 'room' ? '#' : ':'}
                            </span>
                            {suggestion.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </section>
    );
};

export default MessageComposer;
