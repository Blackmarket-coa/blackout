import {
  Fragment,
  type CSSProperties,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
import { sanitizeMatrixHtml } from '../../utils/markdown';
import { useRoom } from '../../hooks/useRoom';
import { useRoomTimeline, useTimelineScroll } from '../../hooks/useTimeline';
import { useTypingIndicator } from '../../hooks/useTyping';
import {
  AudioMessage as TimelineAudioMessage,
  FileMessage as TimelineFileMessage,
  ImageMessage as TimelineImageMessage,
  StickerMessage as TimelineStickerMessage,
  VideoMessage as TimelineVideoMessage,
} from '../../components/messages';
import { Reactions } from './Reactions';

const ROW_ESTIMATE = 88;
const OVERSCAN = 10;

interface TimelineItemBase {
  id: string;
  kind: 'day' | 'message' | 'unread';
}

interface DayDividerItem extends TimelineItemBase {
  kind: 'day';
  label: string;
}

interface UnreadDividerItem extends TimelineItemBase {
  kind: 'unread';
}

interface MessageItem extends TimelineItemBase {
  kind: 'message';
  event: MatrixEvent;
  groupedWithPrevious: boolean;
}

type TimelineItem = DayDividerItem | UnreadDividerItem | MessageItem;

interface RoomTimelineProps {
  roomId: string;
  jumpToEventId?: string;
  unreadEventId?: string;
  hasMoreBackPagination?: boolean;
  onJumpResolved?: (eventId: string, found: boolean) => void;
}

interface MessageBubbleProps {
  event: MatrixEvent;
  groupedWithPrevious?: boolean;
  receipts?: ReadReceipt[];
}

interface ReadReceipt {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

const styles: Record<string, CSSProperties> = {
  timeline: {
    height: '100%',
    position: 'relative',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
  },
  scroller: {
    height: '100%',
    overflowY: 'auto',
    padding: '12px 10px 60px',
  },
  viewport: {
    position: 'relative',
    width: '100%',
  },
  row: {
    padding: '2px 0',
  },
  dayDivider: {
    display: 'flex',
    justifyContent: 'center',
    margin: '8px 0',
  },
  dividerLabel: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    padding: '2px 10px',
  },
  unreadDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '12px 0 8px',
    color: 'var(--accent-primary)',
    fontSize: 12,
    fontWeight: 600,
  },
  unreadRule: {
    flex: 1,
    borderTop: '1px solid var(--accent-primary)',
  },
  messageRow: {
    display: 'grid',
    gridTemplateColumns: '36px 1fr',
    gap: 8,
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    objectFit: 'cover',
    background: 'var(--bg-input)',
  },
  avatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: 'var(--accent-muted)',
  },
  bubble: {
    borderRadius: 12,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface-hover)',
    padding: '6px 10px',
    minWidth: 0,
  },
  stickerBubble: {
    background: 'transparent',
    border: 'none',
    padding: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  sender: {
    fontWeight: 600,
    color: 'var(--text-primary)',
    fontSize: 13,
  },
  timestamp: {
    color: 'var(--text-muted)',
    fontSize: 11,
  },
  body: {
    fontSize: 14,
    lineHeight: 1.45,
    overflowWrap: 'anywhere',
    color: 'var(--text-primary)',
  },
  notice: {
    color: 'var(--text-secondary)',
    fontStyle: 'italic',
  },
  relationBar: {
    marginTop: 6,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    padding: '2px 8px',
    fontSize: 12,
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
  },
  readReceipts: {
    marginTop: 6,
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  receiptAvatar: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: '1px solid var(--bg-surface)',
    objectFit: 'cover',
    background: 'var(--accent-muted)',
  },
  jumpButton: {
    position: 'absolute',
    right: 12,
    bottom: 54,
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 12,
    padding: '6px 10px',
    cursor: 'pointer',
  },
  typingBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTop: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    color: 'var(--text-secondary)',
    padding: '8px 12px',
    fontSize: 12,
  },
  stateEvent: {
    color: 'var(--text-secondary)',
    fontSize: 12,
    textAlign: 'center',
    margin: '2px 0 6px',
  },
  media: {
    maxWidth: '100%',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
  },
};

const getEventSender = (event: MatrixEvent): string => event.getSender() ?? 'Unknown';

const getDisplayName = (room: Room | null, userId: string): string => room?.getMember(userId)?.name ?? userId;

const formatEventTime = (event: MatrixEvent): string => {
  const ts = event.getTs?.() ?? Date.now();
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const dateLabel = (timestamp: number): string => {
  const date = new Date(timestamp);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (startOfDate.getTime() === startOfToday.getTime()) return 'Today';
  if (startOfDate.getTime() === startOfYesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const getMsgType = (event: MatrixEvent): string => {
  const content = event.getContent<Record<string, unknown>>();
  return typeof content.msgtype === 'string' ? content.msgtype : event.getType();
};

const getBody = (event: MatrixEvent): string => {
  const content = event.getContent<Record<string, unknown>>();
  return typeof content.body === 'string' ? content.body : '';
};

const getHtmlBody = (event: MatrixEvent): string | null => {
  const content = event.getContent<Record<string, unknown>>();
  return typeof content.formatted_body === 'string' ? content.formatted_body : null;
};

const isStateEvent = (event: MatrixEvent): boolean => event.getType().startsWith('m.room.') && event.isState();

const resolveStateCopy = (event: MatrixEvent, room: Room | null): string => {
  const sender = getDisplayName(room, getEventSender(event));
  const content = event.getContent<Record<string, unknown>>();

  switch (event.getType()) {
    case 'm.room.member': {
      const membership = typeof content.membership === 'string' ? content.membership : 'updated membership';
      return `${sender} ${membership}`;
    }
    case 'm.room.name':
      return `Room name changed to “${typeof content.name === 'string' ? content.name : 'Unknown'}”`;
    case 'm.room.topic':
      return `Topic changed: ${typeof content.topic === 'string' ? content.topic : ''}`;
    case 'm.room.avatar':
      return `${sender} changed the room avatar`;
    case 'm.room.encryption':
      return 'Encryption is now enabled';
    default:
      return `${event.getType()} updated`;
  }
};

const getAvatar = (room: Room | null, userId: string): string | null => {
  const url = room?.getMember(userId)?.getMxcAvatarUrl?.();
  return url ?? null;
};

const getRelation = (event: MatrixEvent): Record<string, unknown> | null => {
  const content = event.getContent<Record<string, unknown>>();
  const relation = content['m.relates_to'];
  return typeof relation === 'object' && relation !== null ? (relation as Record<string, unknown>) : null;
};

const buildTimelineItems = (events: MatrixEvent[], unreadEventId?: string): TimelineItem[] => {
  const items: TimelineItem[] = [];
  let lastDay = '';

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const day = dateLabel(event.getTs());
    if (day !== lastDay) {
      items.push({ id: `day-${event.getId() ?? i}`, kind: 'day', label: day });
      lastDay = day;
    }

    if (unreadEventId && event.getId() === unreadEventId) {
      items.push({ id: `unread-${event.getId()}`, kind: 'unread' });
    }

    const prev = events[i - 1];
    const groupedWithPrevious =
      Boolean(prev) &&
      getEventSender(prev) === getEventSender(event) &&
      dateLabel(prev.getTs()) === day &&
      Math.abs(event.getTs() - prev.getTs()) < 5 * 60_000 &&
      !isStateEvent(prev) &&
      !isStateEvent(event);

    items.push({
      id: event.getId() ?? `event-${i}`,
      kind: 'message',
      event,
      groupedWithPrevious,
    });
  }

  return items;
};

export const TextMessage = memo(({ event }: MessageBubbleProps) => {
  const html = getHtmlBody(event);
  if (html) {
    return <div style={styles.body} dangerouslySetInnerHTML={{ __html: sanitizeMatrixHtml(html) }} />;
  }
  return <div style={styles.body}>{getBody(event)}</div>;
});

export const ImageMessage = memo(({ event }: MessageBubbleProps) => {
  const content = event.getContent<Record<string, unknown>>();
  const url = typeof content.url === 'string' ? content.url : '';
  const body = getBody(event);
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open image in lightbox">
      <img style={styles.media} src={url} alt={body || 'Image'} loading="lazy" />
    </a>
  );
});

export const VideoMessage = memo(({ event }: MessageBubbleProps) => {
  const content = event.getContent<Record<string, unknown>>();
  const url = typeof content.url === 'string' ? content.url : '';
  return <video style={styles.media} controls src={url} preload="metadata" />;
});

export const AudioMessage = memo(({ event }: MessageBubbleProps) => {
  const content = event.getContent<Record<string, unknown>>();
  const url = typeof content.url === 'string' ? content.url : '';
  return (
    <div>
      <audio controls src={url} style={{ width: '100%' }} />
      <div style={{ ...styles.pill, marginTop: 6 }}>Waveform preview (voice)</div>
    </div>
  );
});

export const FileMessage = memo(({ event }: MessageBubbleProps) => {
  const content = event.getContent<Record<string, unknown>>();
  const url = typeof content.url === 'string' ? content.url : '';
  const body = getBody(event) || 'Download file';
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ ...styles.pill, display: 'inline-block' }}>
      ⬇ {body}
    </a>
  );
});

export const StickerMessage = memo(({ event }: MessageBubbleProps) => {
  const content = event.getContent<Record<string, unknown>>();
  const url = typeof content.url === 'string' ? content.url : '';
  return <img src={url} alt={getBody(event) || 'Sticker'} style={{ ...styles.media, border: 'none', maxWidth: 220 }} />;
});

export const NoticeMessage = memo(({ event }: MessageBubbleProps) => <div style={{ ...styles.body, ...styles.notice }}>{getBody(event)}</div>);

const ReplyPreview = ({ event }: { event: MatrixEvent }) => {
  const relation = getRelation(event);
  const inReplyTo = relation?.['m.in_reply_to'] as Record<string, unknown> | undefined;
  if (!inReplyTo || typeof inReplyTo.event_id !== 'string') return null;
  return <div style={styles.pill}>Replying to {inReplyTo.event_id.slice(0, 12)}…</div>;
};

const ThreadIndicator = ({ event }: { event: MatrixEvent }) => {
  const relation = getRelation(event);
  if (relation?.rel_type !== 'm.thread') return null;
  const count = typeof relation.count === 'number' ? relation.count : 1;
  return <div style={styles.pill}>🧵 {count} repl{count === 1 ? 'y' : 'ies'}</div>;
};

const EditedIndicator = ({ event }: { event: MatrixEvent }) => {
  const relation = getRelation(event);
  if (relation?.rel_type !== 'm.replace') return null;
  return <span style={styles.timestamp}>(edited)</span>;
};

const renderMessageType = (event: MatrixEvent): ReactNode => {
  if (event.isRedacted() || event.getType() === 'm.room.redaction') {
    return <div style={styles.notice}>[message deleted]</div>;
  }

  if (event.getType() === 'm.sticker') return <TimelineStickerMessage event={event} />;

  switch (getMsgType(event)) {
    case 'm.image':
      return <TimelineImageMessage event={event} />;
    case 'm.video':
      return <TimelineVideoMessage event={event} />;
    case 'm.audio':
      return <TimelineAudioMessage event={event} />;
    case 'm.file':
      return <TimelineFileMessage event={event} />;
    case 'm.notice':
      return <NoticeMessage event={event} />;
    case 'm.text':
    default:
      return <TextMessage event={event} />;
  }
};

const MessageBubble = ({
  event,
  groupedWithPrevious = false,
  receipts = [],
  room,
  roomId,
}: MessageBubbleProps & { room: Room | null; roomId: string }) => {
  const sender = getEventSender(event);
  const avatar = getAvatar(room, sender);
  const senderName = getDisplayName(room, sender);

  if (isStateEvent(event)) {
    return <div style={styles.stateEvent}>{resolveStateCopy(event, room)}</div>;
  }

  const sticker = getMsgType(event) === 'm.sticker' || event.getType() === 'm.sticker';

  return (
    <article style={styles.messageRow} data-event-id={event.getId() ?? undefined}>
      <div>
        {!groupedWithPrevious ? (
          avatar ? <img src={avatar} alt={senderName} style={styles.avatar} loading="lazy" /> : <div style={styles.avatarPlaceholder} />
        ) : null}
      </div>
      <div style={sticker ? styles.stickerBubble : styles.bubble}>
        {!groupedWithPrevious ? (
          <div style={styles.header}>
            <span style={styles.sender}>{senderName}</span>
            <span style={styles.timestamp}>{formatEventTime(event)}</span>
            <EditedIndicator event={event} />
          </div>
        ) : null}

        <ReplyPreview event={event} />
        {renderMessageType(event)}

        <div style={styles.relationBar}>
          <ThreadIndicator event={event} />
        </div>
        {event.getId() ? <Reactions roomId={roomId} targetEventId={event.getId() ?? ''} /> : null}

        {receipts.length > 0 ? (
          <div style={styles.readReceipts}>
            {receipts.slice(0, 5).map((receipt) =>
              receipt.avatarUrl ? (
                <img key={receipt.userId} src={receipt.avatarUrl} title={receipt.displayName} style={styles.receiptAvatar} alt={receipt.displayName} />
              ) : (
                <div key={receipt.userId} title={receipt.displayName} style={styles.receiptAvatar} />
              ),
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
};

const TypingBar = ({ members }: { members: RoomMember[] }) => {
  if (members.length === 0) return null;
  const names = members.map((member) => member.name || member.userId).slice(0, 3).join(', ');
  return <div style={styles.typingBar}>{names} {members.length === 1 ? 'is' : 'are'} typing…</div>;
};

export const RoomTimeline = ({
  roomId,
  jumpToEventId,
  unreadEventId,
  hasMoreBackPagination = true,
  onJumpResolved,
}: RoomTimelineProps) => {
  const { data: events, loadMore } = useRoomTimeline(roomId);
  const { data: room } = useRoom(roomId);
  const { data: typingMembers } = useTypingIndicator(roomId);
  const { position, savePosition } = useTimelineScroll(roomId);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const items = useMemo(() => buildTimelineItems(events, unreadEventId), [events, unreadEventId]);

  const startIndex = Math.max(Math.floor(scrollTop / ROW_ESTIMATE) - OVERSCAN, 0);
  const endIndex = Math.min(Math.ceil((scrollTop + viewportHeight) / ROW_ESTIMATE) + OVERSCAN, items.length);

  const beforeHeight = startIndex * ROW_ESTIMATE;
  const afterHeight = Math.max(items.length - endIndex, 0) * ROW_ESTIMATE;

  const getReceipts = useCallback(
    (event: MatrixEvent): ReadReceipt[] => {
      if (!room || !event.getId()) return [];
      const receiptEntries = (room.getReceiptsForEvent(event) as Array<{ type?: string; userId: string }>)
        .filter((entry) => entry.type === 'm.read')
        .map((entry) => {
          const member = room.getMember(entry.userId);
          return {
            userId: entry.userId,
            displayName: member?.name ?? entry.userId,
            avatarUrl: member?.getMxcAvatarUrl?.() ?? null,
          };
        });
      return receiptEntries;
    },
    [room],
  );

  const handleScroll = useCallback(async () => {
    const el = scrollerRef.current;
    if (!el) return;

    setScrollTop(el.scrollTop);
    savePosition(el.scrollTop);

    const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 48;
    setIsAtBottom(nearBottom);

    if (el.scrollTop < 80 && hasMoreBackPagination) {
      await loadMore(40);
    }
  }, [hasMoreBackPagination, loadMore, savePosition]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = position;
    setScrollTop(position);
    setViewportHeight(el.clientHeight);
  }, [position]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !isAtBottom) return;
    el.scrollTop = el.scrollHeight;
    setScrollTop(el.scrollTop);
  }, [events.length, isAtBottom]);

  useEffect(() => {
    if (!jumpToEventId) return;
    const index = items.findIndex((item) => item.kind === 'message' && item.event.getId() === jumpToEventId);
    if (index < 0) {
      onJumpResolved?.(jumpToEventId, false);
      return;
    }

    const nextPos = Math.max(index * ROW_ESTIMATE - ROW_ESTIMATE * 2, 0);
    const el = scrollerRef.current;
    if (el) {
      el.scrollTop = nextPos;
      setScrollTop(nextPos);
    }
    onJumpResolved?.(jumpToEventId, true);
  }, [items, jumpToEventId, onJumpResolved]);

  return (
    <section style={styles.timeline}>
      <div ref={scrollerRef} style={styles.scroller} onScroll={() => void handleScroll()}>
        <div style={styles.viewport}>
          <div style={{ height: beforeHeight }} />
          {items.slice(startIndex, endIndex).map((item) => {
            if (item.kind === 'day') {
              return (
                <div key={item.id} style={{ ...styles.row, ...styles.dayDivider }}>
                  <span style={styles.dividerLabel}>{item.label}</span>
                </div>
              );
            }

            if (item.kind === 'unread') {
              return (
                <div key={item.id} style={{ ...styles.row, ...styles.unreadDivider }}>
                  <span style={styles.unreadRule} />
                  <span>New messages</span>
                  <span style={styles.unreadRule} />
                </div>
              );
            }

            return (
              <Fragment key={item.id}>
                <MessageBubble
                  event={item.event}
                  groupedWithPrevious={item.groupedWithPrevious}
                  room={room}
                  roomId={roomId}
                  receipts={getReceipts(item.event)}
                />
              </Fragment>
            );
          })}
          <div style={{ height: afterHeight }} />
        </div>
      </div>

      {!isAtBottom ? (
        <button
          type="button"
          style={styles.jumpButton}
          onClick={() => {
            const el = scrollerRef.current;
            if (!el) return;
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          }}
        >
          Jump to latest
        </button>
      ) : null}

      <TypingBar members={typingMembers} />
    </section>
  );
};

export default RoomTimeline;
