import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';

export interface MatrixMediaInfo {
    mimetype?: string;
    size?: number;
    width?: number;
    height?: number;
}

const parseMxc = (mxcUri: string): { serverName: string; mediaId: string } | null => {
    if (!mxcUri.startsWith('mxc://')) return null;
    const withoutScheme = mxcUri.slice('mxc://'.length);
    const [serverName, ...rest] = withoutScheme.split('/');
    const mediaId = rest.join('/');
    if (!serverName || !mediaId) return null;
    return { serverName, mediaId };
};

/** Convert MXC URI into homeserver media download URL. */
export const mxcToUrl = (mxcUri: string, homeserverUrl: string): string | null => {
    const parsed = parseMxc(mxcUri);
    if (!parsed) return null;
    return `${homeserverUrl.replace(/\/$/, '')}/_matrix/media/v3/download/${parsed.serverName}/${
        parsed.mediaId
    }`;
};

/** Build homeserver media thumbnail URL for MXC content. */
export const getThumbnailUrl = (
    mxcUri: string,
    width: number,
    height: number,
    homeserverUrl: string
): string | null => {
    const parsed = parseMxc(mxcUri);
    if (!parsed) return null;

    const hs = homeserverUrl.replace(/\/$/, '');
    return `${hs}/_matrix/media/v3/thumbnail/${parsed.serverName}/${parsed.mediaId}?width=${width}&height=${height}&method=scale`;
};

/**
 * Upload a file to the Matrix content repository as it is, with its name, and
 * return the MXC URI. The server can read what this uploads: use it for media
 * that is public anyway (avatars, public posts). A file posted into a room
 * goes through `sendRoomAttachment` (features/media/utils/roomAttachment.ts),
 * which encrypts it first when the room is encrypted. Callers of this function
 * are listed in tests/unit/features/media/directUploadCallers.test.ts.
 */
export const uploadMedia = async (mx: MatrixClient, file: File): Promise<string> => {
    const response = await mx.uploadContent(file, {
        includeFilename: true,
        name: file.name,
        type: file.type,
    });

    if (!response.content_uri) {
        throw new Error('Matrix upload succeeded but no content_uri was returned.');
    }

    return response.content_uri;
};

/**
 * The URL to load an avatar from: this homeserver's thumbnail of an `mxc://`
 * address, and null for anything else.
 *
 * A profile, a membership event or a message can carry any string where an
 * image address belongs. Handing an `https://` one to the browser would make
 * every reader's device fetch it, which tells a server of that person's
 * choosing who is looking at the room, from which network address, and when.
 * Only media held by the homeserver is loaded.
 */
export const avatarThumbnailUrl = (
    avatar: unknown,
    homeserverUrl: string,
    size = 96
): string | null =>
    typeof avatar === 'string' && homeserverUrl
        ? getThumbnailUrl(avatar, size, size, homeserverUrl)
        : null;

/** The homeserver a room's client is signed in to, or '' when it cannot be told. */
export const roomHomeserverUrl = (room: unknown): string =>
    (
        room as { client?: { getHomeserverUrl?: () => string } } | null | undefined
    )?.client?.getHomeserverUrl?.() ?? '';

/** Extract media metadata from Matrix event content info block. */
export const getMediaInfo = (event: MatrixEvent): MatrixMediaInfo => {
    const content = event.getContent<Record<string, unknown>>();
    const info = (content.info as Record<string, unknown> | undefined) ?? {};

    return {
        mimetype: typeof info.mimetype === 'string' ? info.mimetype : undefined,
        size: typeof info.size === 'number' ? info.size : undefined,
        width: typeof info.w === 'number' ? info.w : undefined,
        height: typeof info.h === 'number' ? info.h : undefined,
    };
};
