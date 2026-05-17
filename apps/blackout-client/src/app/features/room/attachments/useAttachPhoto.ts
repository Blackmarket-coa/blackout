import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { isNativePlatform } from '../../../../platform/nativeMediaBridge';
import { pickPhotoAttachment } from './pickPhotoAttachment';
import { trackAttachPhoto } from './attachmentsTelemetry';

export interface UseAttachPhotoOptions {
    setAttachments: Dispatch<SetStateAction<File[]>>;
    attachmentInputRef: RefObject<HTMLInputElement>;
    /** Test override for the native picker. Defaults to `pickPhotoAttachment`. */
    pickPhoto?: typeof pickPhotoAttachment;
    /** Test override for the native-runtime probe. Defaults to `isNativePlatform`. */
    isNative?: () => boolean;
    /** Test override for the telemetry sink. Defaults to `trackAttachPhoto`. */
    track?: typeof trackAttachPhoto;
}

/**
 * Composer attach-action handler — closes the Port 4 native-composer
 * carry-over. On native runtimes opens the Capacitor camera/gallery
 * picker via `pickPhotoAttachment` and appends the returned File to
 * the composer's `attachments` state; on web falls back to clicking
 * the hidden `<input type="file">` ref the composer already owns.
 *
 * Emits `attach_photo_picked` telemetry tagged with the resolved
 * source (`camera` | `gallery` | `auto` from the bridge, or `web` for
 * the file-input fallback) so adoption of the native picker is
 * observable in launch dashboards.
 */
export const useAttachPhoto = ({
    setAttachments,
    attachmentInputRef,
    pickPhoto = pickPhotoAttachment,
    isNative = isNativePlatform,
    track = trackAttachPhoto,
}: UseAttachPhotoOptions) =>
    useCallback(async () => {
        if (isNative()) {
            const result = await pickPhoto({ source: 'auto' });
            if (result) {
                setAttachments((prev) => [...prev, result.file]);
                track(result.source);
            }
            return;
        }
        attachmentInputRef.current?.click();
        track('web');
    }, [setAttachments, attachmentInputRef, pickPhoto, isNative, track]);
