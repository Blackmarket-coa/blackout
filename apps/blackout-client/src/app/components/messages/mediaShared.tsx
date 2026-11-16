import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import { mxcToUrl } from '../../utils/media';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { BlackoutSdkError, MEDIA_TOO_LARGE } from '@blackout/sdk';
import {
    ENCRYPTED_AUTO_LOAD_MAX_BYTES,
    fetchDecryptedMedia,
    hasEncryptedFileField,
    inlineBlobType,
    readEncryptedFile,
} from '../../features/media/utils/encryptedMedia';

export const formatBytes = (value?: number): string => {
    if (!value || Number.isNaN(value)) return 'Unknown size';
    const units = ['B', 'KB', 'MB', 'GB'];
    let next = value;
    let unit = 0;
    while (next >= 1024 && unit < units.length - 1) {
        next /= 1024;
        unit += 1;
    }
    return `${next.toFixed(next >= 100 ? 0 : 1)} ${units[unit]}`;
};

export const useInViewport = <T extends HTMLElement>() => {
    const ref = useRef<T | null>(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.some((entry) => entry.isIntersecting);
                setInView(visible);
            },
            { rootMargin: '240px 0px' }
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    return { ref, inView };
};

/**
 * Latches true the first time `value` is true. Media that has scrolled into
 * view once stays loaded when it scrolls out again, so a decrypted file is
 * not thrown away and fetched again on every pass.
 */
export const useLatched = (value: boolean): boolean => {
    const [latched, setLatched] = useState(value);
    useEffect(() => {
        if (value) setLatched(true);
    }, [value]);
    return latched || value;
};

export const getInfo = (event: MatrixEvent): Record<string, unknown> => {
    const content = event.getContent<Record<string, unknown>>();
    return typeof content.info === 'object' && content.info !== null
        ? (content.info as Record<string, unknown>)
        : {};
};

/**
 * Whether an encrypted attachment may be fetched without being asked for:
 * only when its message states a size, and that size is within the limit.
 * The limit is enforced again on the bytes that arrive.
 */
export const fitsEncryptedAutoLoad = (info: Record<string, unknown>): boolean =>
    typeof info.size === 'number' && info.size >= 0 && info.size <= ENCRYPTED_AUTO_LOAD_MAX_BYTES;

const homeserverUrlOf = (client: unknown): string =>
    (client as { getHomeserverUrl?: () => string }).getHomeserverUrl?.() ?? '';

const roomIsEncrypted = (client: unknown, event: MatrixEvent): boolean => {
    const roomId = event.getRoomId();
    if (!roomId) return false;
    const room = (
        client as {
            getRoom?: (id: string) => { hasEncryptionStateEvent?: () => boolean } | null;
        }
    ).getRoom?.(roomId);
    return room?.hasEncryptionStateEvent?.() === true;
};

const describeMediaError = (err: unknown): string => {
    if (err instanceof BlackoutSdkError && err.kind === 'retryable') {
        return `${err.message} Retrying may succeed.`;
    }
    return err instanceof Error ? err.message : 'Failed to load media';
};

export interface ResolveMediaOptions {
    /**
     * Encrypted media only: fetch and decrypt without waiting for `load()`.
     * Unencrypted media is a URL and is never fetched here.
     */
    autoLoad: boolean;
}

export interface ResolvedMediaSource {
    /** A URL for `<img>`, `<audio>`, `<video>`: the media URL, or a blob URL of the decrypted file. */
    src: string | null;
    loading: boolean;
    error: string | null;
    /** The message references its media through an encrypted `file`. */
    encrypted: boolean;
    /** Encrypted and not fetched: waiting for `load()`. */
    awaitingLoad: boolean;
    /** Fetch and decrypt now, whatever the size. Also retries after a failure. */
    load: () => void;
    /** The room is end-to-end encrypted and this media was sent without encryption. */
    unencryptedInEncryptedRoom: boolean;
}

export const useResolvedMediaSource = (
    event: MatrixEvent,
    { autoLoad }: ResolveMediaOptions
): ResolvedMediaSource => {
    const client = useMatrixClient();
    const [src, setSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Which message the reader asked to load (no size ceiling applies to it),
    // and which message's unasked fetch hit the ceiling (it waits for the
    // reader). Held as the message, not as a flag: a component that is reused
    // for another message starts from nothing, with no stale "asked for".
    const [requestedFor, setRequestedFor] = useState<MatrixEvent | null>(null);
    const [autoRefusedFor, setAutoRefusedFor] = useState<MatrixEvent | null>(null);
    // Bumped by `load()`, so asking again after a failure fetches again.
    const [attempt, setAttempt] = useState(0);
    const requested = requestedFor === event;
    const autoRefused = autoRefusedFor === event;

    const content = useMemo(() => event.getContent<Record<string, unknown>>(), [event]);
    const encryptedFile = useMemo(() => readEncryptedFile(content), [content]);
    // A `file` field that cannot be used is still an encrypted reference: it
    // must never fall back to a plain `url` sitting beside it.
    const encrypted = useMemo(() => hasEncryptedFileField(content), [content]);
    const plainMxc = !encrypted && typeof content.url === 'string' ? content.url : null;
    const declaredType = (content.info as { mimetype?: unknown } | undefined)?.mimetype;

    const shouldDecrypt = requested || (autoLoad && !autoRefused);

    useEffect(() => {
        let active = true;
        let objectUrl: string | null = null;
        const homeserverUrl = homeserverUrlOf(client);

        if (!encrypted) {
            const directUrl = plainMxc ? mxcToUrl(plainMxc, homeserverUrl) : null;
            setSrc(directUrl);
            setError(directUrl ? null : plainMxc ? 'Invalid MXC URI' : 'Missing media URL');
            setLoading(false);
            return undefined;
        }

        if (!encryptedFile) {
            setSrc(null);
            setError('This message refers to an encrypted file but does not carry a usable key.');
            setLoading(false);
            return undefined;
        }

        if (!shouldDecrypt) {
            setSrc(null);
            setError(null);
            setLoading(false);
            return undefined;
        }

        setSrc(null);
        setError(null);
        setLoading(true);
        fetchDecryptedMedia({
            file: encryptedFile,
            homeserverUrl,
            blobType: inlineBlobType(declaredType),
            maxBytes: requested ? undefined : ENCRYPTED_AUTO_LOAD_MAX_BYTES,
        })
            .then((blob) => {
                if (!active) return;
                objectUrl = URL.createObjectURL(blob);
                setSrc(objectUrl);
            })
            .catch((err: unknown) => {
                if (!active) return;
                if (!requested && err instanceof BlackoutSdkError && err.code === MEDIA_TOO_LARGE) {
                    // Larger than its message said. Not an error to show:
                    // the reader can still ask for it.
                    setAutoRefusedFor(event);
                    return;
                }
                setError(describeMediaError(err));
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [
        attempt,
        client,
        declaredType,
        encrypted,
        encryptedFile,
        event,
        plainMxc,
        requested,
        shouldDecrypt,
    ]);

    const load = useCallback(() => {
        setRequestedFor(event);
        setAttempt((n) => n + 1);
    }, [event]);

    return {
        src,
        loading,
        error,
        encrypted,
        awaitingLoad: encrypted && Boolean(encryptedFile) && !shouldDecrypt,
        load,
        unencryptedInEncryptedRoom: Boolean(plainMxc) && roomIsEncrypted(client, event),
    };
};

/**
 * Shown under media that was sent without encryption into an encrypted room.
 * Files sent from this app before 2026-11-16 are in this state, as is media
 * posted by bridges and bots that do not encrypt.
 */
export const UNENCRYPTED_MEDIA_NOTE =
    'Not end-to-end encrypted: this file was sent without encryption, and the server can read it.';

export const UnencryptedMediaNote = () => (
    <div
        role="note"
        data-testid="unencrypted-media-note"
        style={{ color: 'var(--text-warning, var(--warning))', fontSize: 11, marginTop: 4 }}
    >
        {UNENCRYPTED_MEDIA_NOTE}
    </div>
);

/**
 * A failed load, with a way to try again when the media is encrypted (an
 * unencrypted one is loaded by the browser from its URL, not by this code).
 */
export const MediaLoadError = ({
    what,
    error,
    onRetry,
}: {
    what: string;
    error: string;
    onRetry?: () => void;
}) => (
    <div style={baseStyles.error} data-testid="media-load-error">
        {what}: {error}
        {onRetry ? (
            <button
                type="button"
                onClick={onRetry}
                data-testid="retry-encrypted-media"
                style={{ marginLeft: 8 }}
            >
                Try again
            </button>
        ) : null}
    </div>
);

/** The label on the button that fetches an encrypted file the reader has to ask for. */
export const loadEncryptedLabel = (kind: string, info: Record<string, unknown>): string => {
    const size = typeof info.size === 'number' ? ` (${formatBytes(info.size)})` : '';
    return `Load encrypted ${kind}${size}`;
};

export const baseStyles = {
    surface: {
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        background: 'var(--bg-surface-hover)',
        color: 'var(--text-primary)',
    },
    skeleton: {
        background:
            'linear-gradient(90deg, var(--bg-input), var(--bg-surface-hover), var(--bg-input))',
        backgroundSize: '200% 100%',
        animation: 'pulse 1.5s infinite',
    },
    error: {
        border: '1px dashed var(--danger)',
        borderRadius: 8,
        color: 'var(--danger)',
        background: 'var(--bg-input)',
        padding: 12,
        fontSize: 12,
    },
} as const;
