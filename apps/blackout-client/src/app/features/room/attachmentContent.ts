/**
 * Attachment → `m.room.message` content mapping for the composer.
 *
 * Attachments used to fall through the legacy adapter as `msgtype:
 * 'm.file'` regardless of type, so a pasted or drag-dropped image
 * rendered as a generic file card instead of the inline image viewer.
 * This maps the mimetype to the right msgtype (the timeline routes
 * m.image / m.video / m.audio to dedicated renderers) — closing the
 * Workstream D "paste-image flow end-to-end" exit criterion.
 *
 * Voice notes do NOT go through this: they carry the MSC3245 marker via
 * `voiceMessage.ts`.
 */

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

export const attachmentKind = (mimeType: string): AttachmentKind => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'file';
};

const MSG_TYPE: Record<AttachmentKind, string> = {
    image: 'm.image',
    video: 'm.video',
    audio: 'm.audio',
    file: 'm.file',
};

export interface AttachmentContentInput {
    url: string;
    fileName: string;
    mimeType: string;
    size: number;
    /** Pixel dimensions, when known (images measured before upload). */
    dims?: { w: number; h: number };
}

export function buildAttachmentContent(input: AttachmentContentInput): Record<string, unknown> {
    const info: Record<string, unknown> = {
        mimetype: input.mimeType,
        size: input.size,
    };
    if (input.dims) {
        info.w = input.dims.w;
        info.h = input.dims.h;
    }
    return {
        msgtype: MSG_TYPE[attachmentKind(input.mimeType)],
        body: input.fileName,
        url: input.url,
        info,
    };
}

/**
 * Measure an image attachment's pixel dimensions. Best-effort: runtimes
 * without createImageBitmap (or undecodable payloads) yield undefined
 * and the message simply omits w/h.
 */
export const measureImageAttachment = async (
    file: File
): Promise<{ w: number; h: number } | undefined> => {
    if (typeof createImageBitmap !== 'function') return undefined;
    try {
        const bitmap = await createImageBitmap(file);
        const dims = { w: bitmap.width, h: bitmap.height };
        bitmap.close?.();
        return dims;
    } catch {
        return undefined;
    }
};
