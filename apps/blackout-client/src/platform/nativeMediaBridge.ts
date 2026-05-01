export type NativeSharePayload = {
    title?: string;
    text?: string;
    url?: string;
    dialogTitle?: string;
};

type CapacitorBridge = {
    isNativePlatform?: () => boolean;
};

type CapacitorSharePlugin = {
    share?: (options: {
        title?: string;
        text?: string;
        url?: string;
        dialogTitle?: string;
    }) => Promise<unknown>;
};

type ShareDispatchOutcome = 'capacitor' | 'web-share' | 'clipboard' | 'unsupported';

// Optional native deps. Marked dynamic via runtime-built specifier so Vite
// does not try to statically resolve them in browser builds; the wrappers
// inject these modules at runtime when running inside Capacitor.
const CAPACITOR_CORE_MODULE = '@capacitor/core';
const CAPACITOR_SHARE_MODULE = '@capacitor/share';
const CAPACITOR_CAMERA_MODULE = '@capacitor/camera';

async function tryCapacitorShare(payload: NativeSharePayload): Promise<boolean> {
    try {
        const core = (await import(/* @vite-ignore */ CAPACITOR_CORE_MODULE)) as {
            Capacitor?: CapacitorBridge;
        };
        if (!core.Capacitor?.isNativePlatform?.()) return false;

        const sharePlugin = (await import(/* @vite-ignore */ CAPACITOR_SHARE_MODULE)) as {
            Share?: CapacitorSharePlugin;
        };
        if (!sharePlugin.Share?.share) return false;

        await sharePlugin.Share.share({
            title: payload.title,
            text: payload.text,
            url: payload.url,
            dialogTitle: payload.dialogTitle ?? 'Share from Blackout',
        });
        return true;
    } catch {
        return false;
    }
}

async function tryWebShare(payload: NativeSharePayload): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    const share = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share;
    if (typeof share !== 'function') return false;

    try {
        await share.call(navigator, {
            title: payload.title,
            text: payload.text,
            url: payload.url,
        });
        return true;
    } catch {
        return false;
    }
}

async function tryClipboard(payload: NativeSharePayload): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    const clipboard = (navigator as Navigator & {
        clipboard?: { writeText?: (data: string) => Promise<void> };
    }).clipboard;
    if (!clipboard?.writeText) return false;

    const candidate = payload.url ?? payload.text ?? payload.title;
    if (!candidate) return false;

    try {
        await clipboard.writeText(candidate);
        return true;
    } catch {
        return false;
    }
}

/**
 * Share content using the most capable available transport:
 *   1. Capacitor `@capacitor/share` (mobile native sheet)
 *   2. Web Share API (`navigator.share`, available in modern browsers and
 *      most desktop webviews)
 *   3. Clipboard fallback for the canonical url/text
 *
 * Returns the outcome so call sites can show appropriate UI feedback.
 */
export async function nativeShare(payload: NativeSharePayload): Promise<ShareDispatchOutcome> {
    if (await tryCapacitorShare(payload)) return 'capacitor';
    if (await tryWebShare(payload)) return 'web-share';
    if (await tryClipboard(payload)) return 'clipboard';
    return 'unsupported';
}

/**
 * Quick capability probe so call sites can hide a Share button when the
 * environment cannot fulfill it through any transport.
 */
export function nativeCanShare(): boolean {
    if (typeof navigator !== 'undefined') {
        const nav = navigator as Navigator & {
            share?: (data: ShareData) => Promise<void>;
            clipboard?: { writeText?: (data: string) => Promise<void> };
        };
        if (typeof nav.share === 'function') return true;
        if (typeof nav.clipboard?.writeText === 'function') return true;
    }
    // Capacitor presence is detected lazily inside nativeShare(); we can't
    // probe synchronously without a dynamic import.
    return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Camera / media-pick (closes the camera deferral on WRAP-004 once BKL-006
// gives the canonical client a media-pipeline consumer to surface picks.)
// ────────────────────────────────────────────────────────────────────────────

export type NativePickedPhoto = {
    /** Source the photo came from. Helpful for telemetry + UX copy. */
    source: 'capacitor-camera' | 'capacitor-gallery' | 'file-input';
    /** MIME type as reported by the picker. */
    contentType: string;
    /** Raw payload as a Blob so callers can hand it straight to the upload pipeline. */
    blob: Blob;
    /** Filename when the picker provided one; falls back to a synthetic name. */
    filename: string;
};

export type NativePhotoSource = 'camera' | 'gallery' | 'auto';

type CapacitorCameraPlugin = {
    getPhoto?: (options: {
        quality?: number;
        allowEditing?: boolean;
        resultType?: string;
        source?: string;
    }) => Promise<{ dataUrl?: string; format?: string; webPath?: string }>;
};

const FALLBACK_PHOTO_FILENAME = 'photo.jpg';

const dataUrlToBlob = async (dataUrl: string): Promise<Blob | null> => {
    try {
        // Direct fetch is allowed here (documented exemption): fetch() against a
        // data: URI is a synchronous local decode, not a network call. See
        // apps/blackout-client/src/app/sdk/NETWORK_BOUNDARY_INVENTORY.md.
        const response = await fetch(dataUrl);
        if (!response.ok) return null;
        return await response.blob();
    } catch {
        return null;
    }
};

const tryCapacitorCamera = async (
    source: NativePhotoSource
): Promise<NativePickedPhoto | null> => {
    try {
        const core = (await import(/* @vite-ignore */ CAPACITOR_CORE_MODULE)) as {
            Capacitor?: CapacitorBridge;
        };
        if (!core.Capacitor?.isNativePlatform?.()) return null;

        const cameraPlugin = (await import(/* @vite-ignore */ CAPACITOR_CAMERA_MODULE)) as {
            Camera?: CapacitorCameraPlugin;
        };
        if (!cameraPlugin.Camera?.getPhoto) return null;

        const result = await cameraPlugin.Camera.getPhoto({
            quality: 90,
            allowEditing: false,
            resultType: 'dataUrl',
            source:
                source === 'camera'
                    ? 'CAMERA'
                    : source === 'gallery'
                    ? 'PHOTOS'
                    : 'PROMPT',
        });
        if (!result?.dataUrl) return null;

        const blob = await dataUrlToBlob(result.dataUrl);
        if (!blob) return null;

        const ext = result.format ?? blob.type.split('/').pop() ?? 'jpg';
        return {
            source: source === 'gallery' ? 'capacitor-gallery' : 'capacitor-camera',
            contentType: blob.type || 'image/jpeg',
            blob,
            filename: `photo.${ext}`,
        };
    } catch {
        return null;
    }
};

const tryFileInput = (source: NativePhotoSource): Promise<NativePickedPhoto | null> => {
    if (typeof document === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        if (source === 'camera') {
            // The `capture` hint nudges mobile webviews toward the camera UI
            // without forcing it; ignored on desktop browsers.
            input.setAttribute('capture', 'environment');
        }
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        input.addEventListener(
            'change',
            () => {
                const file = input.files?.[0];
                if (!file) {
                    document.body.removeChild(input);
                    resolve(null);
                    return;
                }
                document.body.removeChild(input);
                resolve({
                    source: 'file-input',
                    contentType: file.type || 'image/jpeg',
                    blob: file,
                    filename: file.name || FALLBACK_PHOTO_FILENAME,
                });
            },
            { once: true }
        );
        input.addEventListener(
            'cancel',
            () => {
                document.body.removeChild(input);
                resolve(null);
            },
            { once: true }
        );
        document.body.appendChild(input);
        input.click();
    });
};

/**
 * Prompts the user for a photo using the most capable available transport:
 *   1. Capacitor `@capacitor/camera` (camera or gallery, native sheet)
 *   2. `<input type="file" accept="image/*">` fallback for browser/desktop
 *      webviews (with `capture="environment"` when the caller asked for
 *      camera mode)
 *
 * Resolves to `null` when the user cancels or no transport is available.
 */
export async function nativePickPhoto(
    options: { source?: NativePhotoSource } = {}
): Promise<NativePickedPhoto | null> {
    const source = options.source ?? 'auto';
    const native = await tryCapacitorCamera(source);
    if (native) return native;
    return tryFileInput(source);
}
