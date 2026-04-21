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

export const mxcToUrl = (mxcUri: string, homeserverUrl: string): string | null => {
    const parsed = parseMxc(mxcUri);
    if (!parsed) return null;
    return `${homeserverUrl.replace(/\/$/, '')}/_matrix/media/v3/download/${parsed.serverName}/${
        parsed.mediaId
    }`;
};

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
