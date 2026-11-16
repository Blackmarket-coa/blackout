/**
 * Metadata stripping for outbound image uploads.
 *
 * Re-encodes raster images through a canvas, which discards all embedded
 * metadata (EXIF GPS coordinates, camera model, capture timestamps, color
 * profiles, thumbnails). No external dependency — the browser's canvas encoder
 * simply never writes those segments.
 *
 * Lossy by nature (re-compresses JPEG, flattens to a single frame), so only
 * formats where that's acceptable are stripped; everything else passes through
 * untouched.
 */

const STRIPPABLE_MIME = new Set<string>(['image/jpeg', 'image/png', 'image/webp']);

/** The files this module produced: each is a re-encoded copy with no metadata. */
const cleaned = new WeakSet<File>();

const PICTURE_NAME = /\.(jpe?g|png|webp|heic|heif|avif|tiff?|gif|bmp|jxl|dng)$/i;
const VIDEO_NAME = /\.(mp4|m4v|mov|webm|mkv|3gp|avi)$/i;

const isPicture = (file: File): boolean =>
    file.type.startsWith('image/') || (!file.type && PICTURE_NAME.test(file.name));
const isVideo = (file: File): boolean =>
    file.type.startsWith('video/') || (!file.type && VIDEO_NAME.test(file.name));

/**
 * Whether a file is a picture or a video that would be sent with whatever
 * metadata it carries: anything `stripImageMetadata` did not re-encode. That
 * includes every picture in a format it does not handle (HEIC, AVIF, TIFF,
 * GIF), one it could not re-encode, and every video. A photo or a video from
 * a phone can record where and when it was taken.
 */
export const keepsMetadata = (file: File): boolean =>
    !cleaned.has(file) && (isPicture(file) || isVideo(file));

const canStrip = (file: File): boolean =>
    STRIPPABLE_MIME.has(file.type) &&
    typeof createImageBitmap === 'function' &&
    typeof document !== 'undefined';

/**
 * Return a copy of `file` with embedded metadata removed, or the original file
 * unchanged when the type can't be safely re-encoded (GIF/SVG/PDF/video/etc.)
 * or when canvas APIs are unavailable.
 */
export const stripImageMetadata = async (file: File): Promise<File> => {
    if (!canStrip(file)) return file;

    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        return file;
    }

    try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0);

        const blob = await new Promise<Blob | null>((resolve) => {
            // PNG ignores the quality arg; JPEG/WebP use it.
            canvas.toBlob((result) => resolve(result), file.type, 0.92);
        });
        if (!blob) return file;

        const copy = new File([blob], file.name, {
            type: file.type,
            lastModified: file.lastModified,
        });
        cleaned.add(copy);
        return copy;
    } catch {
        return file;
    } finally {
        bitmap.close();
    }
};
