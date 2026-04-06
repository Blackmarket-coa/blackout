import type { MatrixEvent } from 'matrix-js-sdk';

/** Extract plain text body from event content. */
export const getEventBody = (event: MatrixEvent): string => {
    const content = event.getContent<Record<string, unknown>>();
    return typeof content.body === 'string' ? content.body : '';
};

/** Extract HTML formatted body from event content. */
export const getEventFormattedBody = (event: MatrixEvent): string | null => {
    const content = event.getContent<Record<string, unknown>>();
    return typeof content.formatted_body === 'string' ? content.formatted_body : null;
};

/** True if event has been redacted. */
export const isRedacted = (event: MatrixEvent): boolean => event.isRedacted();

/** True if event contains m.replace relation (message edit). */
export const isEdited = (event: MatrixEvent): boolean => {
    const relation = event.getRelation();
    return relation?.rel_type === 'm.replace';
};

/** Return edited payload content if present. */
export const getEditedContent = (event: MatrixEvent): Record<string, unknown> | null => {
    const content = event.getContent<Record<string, unknown>>();
    const newContent = content['m.new_content'];
    return typeof newContent === 'object' && newContent !== null
        ? (newContent as Record<string, unknown>)
        : null;
};

/** Resolve reply target event ID from relation metadata. */
export const getReplyTo = (event: MatrixEvent): string | null => {
    const content = event.getContent<Record<string, unknown>>();
    const relatesTo = content['m.relates_to'] as Record<string, unknown> | undefined;
    const inReplyTo = relatesTo?.['m.in_reply_to'] as Record<string, unknown> | undefined;
    return typeof inReplyTo?.event_id === 'string' ? inReplyTo.event_id : null;
};

/** Resolve thread root event ID from m.thread relation metadata. */
export const getThreadRoot = (event: MatrixEvent): string | null => {
    const content = event.getContent<Record<string, unknown>>();
    const relatesTo = content['m.relates_to'] as Record<string, unknown> | undefined;
    if (relatesTo?.rel_type !== 'm.thread') return null;
    return typeof relatesTo.event_id === 'string' ? relatesTo.event_id : null;
};

/** Heuristic: true if event should trigger timeline notification UI. */
export const isNotificationEvent = (event: MatrixEvent): boolean => {
    if (isRedacted(event) || isEdited(event)) return false;

    const type = event.getType();
    return type === 'm.room.message' || type === 'm.room.encrypted' || type === 'm.sticker';
};
