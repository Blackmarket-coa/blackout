import { type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BaseEditor, Editor, Element as SlateElement, Node, Range, Text, Transforms, createEditor } from 'slate';
import { withHistory } from 'slate-history';
import { Editable, ReactEditor, Slate, useSlate, withReact } from 'slate-react';
import { useRoomMembers } from '../../hooks/useRoom';
import { useSpaceTree } from '../../hooks/useSpaceHierarchy';
import { useSendMessage, useEditMessage } from '../../hooks/useTimeline';
import { useSendTyping } from '../../hooks/useTyping';

const MAX_SUGGESTIONS = 8;

type Mark = 'bold' | 'italic' | 'strike' | 'code';
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

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

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

const initialValue: CustomElement[] = [{ type: 'paragraph', children: [{ text: '' }] }];

const EMOJI: Array<{ shortcode: string; emoji: string }> = [
  { shortcode: 'smile', emoji: '😄' },
  { shortcode: 'thumbsup', emoji: '👍' },
  { shortcode: 'heart', emoji: '❤️' },
  { shortcode: 'fire', emoji: '🔥' },
  { shortcode: 'tada', emoji: '🎉' },
  { shortcode: 'wave', emoji: '👋' },
  { shortcode: 'thinking', emoji: '🤔' },
  { shortcode: 'eyes', emoji: '👀' },
];

const fuzzyMatch = (term: string, query: string): boolean => {
  if (!query) return true;
  let i = 0;
  for (const c of term.toLowerCase()) {
    if (c === query[i]?.toLowerCase()) i += 1;
    if (i === query.length) return true;
  }
  return false;
};

const toPlainText = (value: CustomElement[]): string => value.map((node) => Node.string(node)).join('\n').trim();

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

const toHtml = (value: CustomElement[]): string => {
  return value
    .map((element) => {
      if (element.type === 'mention') {
        if (element.mentionKind === 'user') {
          return `<a href="https://matrix.to/#/${escapeHtml(element.id)}">${escapeHtml(element.label)}</a>`;
        }
        if (element.mentionKind === 'room') {
          return `<a href="https://matrix.to/#/${escapeHtml(element.id)}">#${escapeHtml(element.label)}</a>`;
        }
        return escapeHtml(element.label);
      }

      if (element.type === 'link') {
        const text = element.children.map(leafToHtml).join('');
        return `<a href="${escapeHtml(element.href)}">${text}</a>`;
      }

      const body = element.children.map(leafToHtml).join('');
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
      match: (n) => SlateElement.isElement(n) && (n.type === 'paragraph' || n.type === 'code_block'),
    });

    if (!blockEntry) return;

    const [block, path] = blockEntry;
    if (!SlateElement.isElement(block)) return;

    const textContent = Node.string(block);
    if (text === '\n' && textContent === '```') {
      Transforms.select(editor, Editor.range(editor, path));
      Transforms.delete(editor);
      Transforms.setNodes(editor, { type: 'code_block' }, { match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n) });
      return;
    }

    const shortcuts: Array<[string, Mark]> = [
      ['**', 'bold'],
      ['*', 'italic'],
      ['~~', 'strike'],
      ['`', 'code'],
    ];

    for (const [token, mark] of shortcuts) {
      const end = selection.anchor;
      const start = Editor.before(editor, end, { distance: token.length + 1, unit: 'character' });
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
  editor.isInline = (element) => (SlateElement.isElement(element) && element.type === 'mention') || isInline(element);
  editor.isVoid = (element) => (SlateElement.isElement(element) && element.type === 'mention') || isVoid(element);
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
            const match = EMOJI.find((item) => item.shortcode === shortcode);
            if (match) {
              Transforms.select(editor, range);
              Transforms.insertText(editor, match.emoji);
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
      { type: 'link', href: word, children: [{ text: word }] },
      { at: range, split: true, match: (n) => Text.isText(n) },
    );
  };
  return editor;
};

const MentionElementView = ({ attributes, children, element }: { attributes: Record<string, unknown>; children: ReactNode; element: MentionElement }) => {
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

const ElementRenderer = (props: { attributes: Record<string, unknown>; children: ReactNode; element: CustomElement }) => {
  const { attributes, children, element } = props;
  switch (element.type) {
    case 'mention':
      return <MentionElementView attributes={attributes} children={children} element={element} />;
    case 'code_block':
      return <pre {...attributes}><code>{children}</code></pre>;
    case 'link':
      return (
        <a {...attributes} href={element.href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)' }}>
          {children}
        </a>
      );
    default:
      return <p {...attributes}>{children}</p>;
  }
};

const LeafRenderer = ({ attributes, children, leaf }: { attributes: Record<string, unknown>; children: ReactNode; leaf: CustomText }) => {
  let content = children;
  if (leaf.bold) content = <strong>{content}</strong>;
  if (leaf.italic) content = <em>{content}</em>;
  if (leaf.strike) content = <del>{content}</del>;
  if (leaf.code) content = <code>{content}</code>;
  return <span {...attributes}>{content}</span>;
};

const ToolbarButton = ({ mark, label }: { mark: Mark; label: string }) => {
  const editor = useSlate();
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        const active = Editor.marks(editor)?.[mark] === true;
        if (active) {
          Editor.removeMark(editor, mark);
        } else {
          Editor.addMark(editor, mark, true);
        }
      }}
      style={{
        border: '1px solid var(--border-default)',
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        borderRadius: 6,
        padding: '2px 8px',
      }}
    >
      {label}
    </button>
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
    () => withLinks(withEmoji(withMentions(withMarkdown(withReact(withHistory(createEditor())))))),
    [],
  );
  const [value, setValue] = useState<CustomElement[]>(initialValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [triggerRange, setTriggerRange] = useState<Range | null>(null);
  const [triggerType, setTriggerType] = useState<MentionKind | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const editableRef = useRef<HTMLDivElement | null>(null);

  const { data: members } = useRoomMembers(roomId);
  const { data: spaces } = useSpaceTree();
  const sendTyping = useSendTyping(roomId);
  const { sendRichText, sendMedia } = useSendMessage(roomId);
  const editMessage = useEditMessage(roomId);

  useEffect(() => {
    if (!initialMarkdown) return;
    setValue([{ type: 'paragraph', children: [{ text: initialMarkdown }] }]);
  }, [initialMarkdown]);

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
    () => members.map((member) => ({ id: member.userId, label: member.name || member.userId, kind: 'user' })),
    [members],
  );

  const emojiSuggestions = useMemo<Suggestion[]>(
    () => EMOJI.map((emoji) => ({ id: emoji.shortcode, label: `${emoji.emoji} :${emoji.shortcode}:`, kind: 'emoji' })),
    [],
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
    const triggerPoint = Editor.before(editor, point, { distance: text.length - offset, unit: 'character' });
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
    const filtered = dataset.filter((item) => fuzzyMatch(item.label, query)).slice(0, MAX_SUGGESTIONS);
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
        const emoji = EMOJI.find((item) => item.shortcode === suggestion.id);
        Transforms.insertText(editor, emoji?.emoji ?? suggestion.label);
      } else {
        const mention: MentionElement = {
          type: 'mention',
          mentionKind: suggestion.kind,
          id: suggestion.id,
          label: suggestion.kind === 'room' ? `#${suggestion.label}` : suggestion.label,
          children: [{ text: '' }],
        };
        Transforms.insertNodes(editor, mention);
        Transforms.insertText(editor, ' ');
      }
      setTriggerRange(null);
      setTriggerType(null);
      setSuggestions([]);
    },
    [editor, triggerRange],
  );

  const sendCurrentMessage = useCallback(async () => {
    const plainBody = toPlainText(value);
    if (!plainBody && attachments.length === 0) return;

    setSending(true);
    try {
      const htmlBody = toHtml(value);
      const bodyToSend = plainBody;
      const formattedBody = htmlBody;

      if (target?.mode === 'edit' && target.eventId) {
        await editMessage(target.eventId, bodyToSend);
      } else {
        const content: Record<string, unknown> = {
          msgtype: 'm.text',
          body: bodyToSend,
          format: 'org.matrix.custom.html',
          formatted_body: formattedBody,
        };

        if (target?.mode === 'reply' && target.eventId) {
          content['m.relates_to'] = {
            'm.in_reply_to': { event_id: target.eventId },
          };
        }

        if (target?.mode === 'thread' && target.rootEventId) {
          content['m.relates_to'] = {
            rel_type: 'm.thread',
            event_id: target.rootEventId,
          };
        }

        await sendRichText(content);
      }

      for (const file of attachments) {
        await sendMedia(file);
      }

      setValue(initialValue);
      setAttachments([]);
      onSent?.();
      await sendTyping(false);
    } finally {
      setSending(false);
    }
  }, [attachments, editMessage, onSent, sendMedia, sendRichText, sendTyping, target, value]);

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
          setActiveIndex((valuePrev) => (valuePrev - 1 + suggestions.length) % suggestions.length);
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
    [activeIndex, selectSuggestion, sendCurrentMessage, suggestions],
  );

  const onDropFiles = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!event.dataTransfer.files.length) return;
    setAttachments((prev) => [...prev, ...Array.from(event.dataTransfer.files)]);
  }, []);

  const onPaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    if (!event.clipboardData.files.length) return;
    setAttachments((prev) => [...prev, ...Array.from(event.clipboardData.files)]);
  }, []);

  const menuPosition = useMemo(() => {
    if (!triggerRange) return null;
    try {
      const domRange = ReactEditor.toDOMRange(editor as ReactEditor, triggerRange);
      const rect = domRange.getBoundingClientRect();
      return { top: rect.bottom + 8, left: rect.left };
    } catch {
      return null;
    }
  }, [editor, triggerRange, value]);

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
      {target?.mode && target.mode !== 'new' ? (
        <div style={{ marginBottom: 8, borderLeft: '2px solid var(--accent-primary)', paddingLeft: 8, color: 'var(--text-secondary)' }}>
          <strong>{target.mode === 'edit' ? 'Editing message' : 'Replying'}</strong>
          {target.quotedText ? <div>{target.quotedText}</div> : null}
        </div>
      ) : null}

      <Slate
        editor={editor}
        value={value}
        onChange={(nextValue) => {
          setValue(nextValue as CustomElement[]);
          runAutocomplete();
        }}
      >
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <ToolbarButton mark="bold" label="B" />
          <ToolbarButton mark="italic" label="I" />
          <ToolbarButton mark="strike" label="S" />
          <ToolbarButton mark="code" label="Code" />
          <label style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: 12 }}>
            <input
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(event) => {
                const files = event.currentTarget.files;
                if (!files) return;
                setAttachments((prev) => [...prev, ...Array.from(files)]);
              }}
            />
            <span style={{ cursor: 'pointer', border: '1px solid var(--border-default)', borderRadius: 6, padding: '2px 8px' }}>Attach</span>
          </label>
        </div>

        <div ref={editableRef} style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: '8px 10px', minHeight: 76 }}>
          <Editable
            placeholder={placeholder}
            renderElement={(props) => <ElementRenderer {...props} />}
            renderLeaf={(props) => <LeafRenderer {...props} />}
            onKeyDown={(event) => void handleKeyDown(event)}
            onPaste={onPaste}
            spellCheck
            autoFocus
          />
        </div>

        {attachments.length > 0 ? (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {attachments.map((file, idx) => (
              <span key={`${file.name}-${idx}`} style={{ border: '1px solid var(--border-default)', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
                {file.name}
              </span>
            ))}
          </div>
        ) : null}

        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Enter to send · Shift+Enter for newline</span>
          <button
            type="button"
            onClick={() => void sendCurrentMessage()}
            disabled={sending}
            style={{
              border: '1px solid var(--border-default)',
              background: 'var(--accent-primary)',
              color: 'var(--bg-surface)',
              borderRadius: 8,
              padding: '6px 10px',
            }}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
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
                background: idx === activeIndex ? 'var(--accent-muted)' : 'transparent',
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
