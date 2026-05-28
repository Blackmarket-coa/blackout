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

        return new File([blob], file.name, {
            type: file.type,
            lastModified: file.lastModified,
        });
    } catch {
        return file;
    } finally {
        bitmap.close();
    }
};
