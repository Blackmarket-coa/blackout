import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { isNativePlatform } from '../../../../platform/nativeMediaBridge';
import { pickPhotoAttachment } from './pickPhotoAttachment';

export interface UseAttachPhotoOptions {
    setAttachments: Dispatch<SetStateAction<File[]>>;
    attachmentInputRef: RefObject<HTMLInputElement>;
    /** Test override for the native picker. Defaults to `pickPhotoAttachment`. */
    pickPhoto?: typeof pickPhotoAttachment;
    /** Test override for the native-runtime probe. Defaults to `isNativePlatform`. */
    isNative?: () => boolean;
}

/**
 * Composer attach-action handler — closes the Port 4 native-composer
 * carry-over. On native runtimes opens the Capacitor camera/gallery
 * picker via `pickPhotoAttachment` and appends the returned File to
 * the composer's `attachments` state; on web falls back to clicking
 * the hidden `<input type="file">` ref the composer already owns.
 */
export const useAttachPhoto = ({
    setAttachments,
    attachmentInputRef,
    pickPhoto = pickPhotoAttachment,
    isNative = isNativePlatform,
}: UseAttachPhotoOptions) =>
    useCallback(async () => {
        if (isNative()) {
            const result = await pickPhoto({ source: 'auto' });
            if (result) setAttachments((prev) => [...prev, result.file]);
            return;
        }
        attachmentInputRef.current?.click();
    }, [setAttachments, attachmentInputRef, pickPhoto, isNative]);
