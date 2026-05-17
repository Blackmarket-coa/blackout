import {
    nativePickPhoto,
    type NativePhotoSource,
    type NativePickedPhoto,
} from '../../../../platform/nativeMediaBridge';

/**
 * Bridges `nativeMediaBridge.nativePickPhoto` to a standard `File`
 * suitable for the `MessageComposer`'s `attachments` state — closes
 * the WRAP-004 / Workstream A Port 4 carry-over per
 * `deferred-bodies-schedule-2026-05-01.md`. The composer already
 * accepts `File[]`, so the call site is a one-liner:
 *
 *   const file = await pickPhotoAttachment({ source: 'auto' });
 *   if (file) setAttachments([...attachments, file]);
 *
 * Returns `null` when:
 *   - the user cancels the native picker (or it isn't available);
 *   - the picked photo's blob is missing/zero-length (defensive — the
 *     bridge already filters most of these cases but we don't trust it
 *     for the composer integration since a zero-byte attachment can
 *     wedge upload retry loops).
 */
export interface PickPhotoOptions {
    source?: NativePhotoSource;
    /**
     * Override for the native picker. Tests inject a fake to avoid
     * touching the Capacitor / file-input transport stack.
     */
    pickPhoto?: typeof nativePickPhoto;
    /**
     * Override for the `File` constructor. Tests inject a fake when the
     * runtime's File constructor doesn't accept the
     * `[BlobParts, name, options]` signature (older Node/jsdom).
     */
    fileFactory?: (
        bits: BlobPart[],
        name: string,
        options?: FilePropertyBag,
    ) => File;
}

export interface PickPhotoAttachmentResult {
    file: File;
    /** Surfaces the bridge's source label for telemetry. */
    source: NativePickedPhoto['source'];
}

const DEFAULT_FILE_FACTORY: NonNullable<PickPhotoOptions['fileFactory']> = (
    bits,
    name,
    options,
) => new File(bits, name, options);

export async function pickPhotoAttachment(
    options: PickPhotoOptions = {},
): Promise<PickPhotoAttachmentResult | null> {
    const pickPhoto = options.pickPhoto ?? nativePickPhoto;
    const fileFactory = options.fileFactory ?? DEFAULT_FILE_FACTORY;

    const picked = await pickPhoto({ source: options.source ?? 'auto' });
    if (!picked) return null;
    if (!picked.blob || picked.blob.size <= 0) return null;

    const filename = picked.filename || `photo-${Date.now()}`;
    const file = fileFactory([picked.blob], filename, {
        type: picked.contentType || 'application/octet-stream',
    });
    return { file, source: picked.source };
}
