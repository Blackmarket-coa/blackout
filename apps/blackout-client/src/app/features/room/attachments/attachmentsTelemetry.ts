import type { NativePickedPhoto } from '../../../../platform/nativeMediaBridge';

export type AttachPhotoSource = NativePickedPhoto['source'] | 'web';

export type AttachmentsTelemetryEvent = {
    name: 'attach_photo_picked';
    source: AttachPhotoSource;
};

const emitTelemetry = (event: AttachmentsTelemetryEvent): void => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('blackout:telemetry', { detail: event }));
};

export const trackAttachPhoto = (source: AttachPhotoSource): void => {
    emitTelemetry({ name: 'attach_photo_picked', source });
};
