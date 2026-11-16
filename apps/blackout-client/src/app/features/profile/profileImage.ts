/**
 * What a profile's stored image address may be handed to the browser as.
 *
 * A profile keeps its avatar and its banner as plain addresses. The editor
 * writes the homeserver's address for a picture it has just uploaded, but the
 * stored value is free text: the profile API accepts any URL, so whoever owns
 * the profile can make it an address on a server of their own. Shown as it
 * is, that address is fetched by the device of everyone who opens the
 * profile, which tells that server who looked, from which network address,
 * and when.
 *
 * So a profile image is shown only when it is a file this homeserver serves:
 * an `mxc://` address, or an address of the homeserver's own media download
 * or thumbnail endpoint. The one other thing let through is a `blob:`
 * address, which is the editor's preview of a picture picked on this device
 * and reaches no network.
 *
 * Media that lives on another Matrix server still loads, through this
 * homeserver: the homeserver fetches it, so the other server sees the
 * homeserver and not the person looking. It can still tell that someone on
 * this homeserver asked for the file, and when, the first time anyone here
 * does; after that the homeserver answers from its own copy.
 */
import { useMatrixClientOrNull } from '../../hooks/useMatrixClient';
import { mxcToUrl } from '../../utils/media';

/**
 * The endpoints that hand back a stored file, under the old media path (any
 * version) and the authenticated one. Not the rest of the media API: its
 * `preview_url` makes the homeserver fetch whatever address it is given.
 */
const MEDIA_FILE_PATH = /^\/_matrix\/(?:media\/[^/]+|client\/v1\/media)\/(?:download|thumbnail)\//;

/** The address in the form the browser will request, when it is homeserver media. */
const homeserverMedia = (candidate: string, homeserverUrl: string): string | null => {
    try {
        const url = new URL(candidate);
        const home = new URL(homeserverUrl);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        if (url.origin !== home.origin) return null;
        // The check is made on the parsed address, where `..` is already
        // resolved, and the parsed address is what is returned.
        const base = home.pathname.replace(/\/+$/, '');
        if (!url.pathname.startsWith(`${base}/`)) return null;
        return MEDIA_FILE_PATH.test(url.pathname.slice(base.length)) ? url.href : null;
    } catch {
        // Not an absolute address: nothing this app should resolve and fetch.
        return null;
    }
};

export const profileImageSrc = (address: unknown, homeserverUrl: string): string | null => {
    if (typeof address !== 'string' || !address) return null;
    if (address.startsWith('blob:')) return address;
    if (!homeserverUrl) return null;
    const candidate = address.startsWith('mxc://') ? mxcToUrl(address, homeserverUrl) : address;
    return candidate ? homeserverMedia(candidate, homeserverUrl) : null;
};

/** `profileImageSrc` for the homeserver the app is signed in to. */
export const useProfileImageSrc = (address: unknown): string | null => {
    const client = useMatrixClientOrNull();
    const homeserverUrl =
        (client as unknown as { getHomeserverUrl?: () => string } | null)?.getHomeserverUrl?.() ??
        '';
    return profileImageSrc(address, homeserverUrl);
};
