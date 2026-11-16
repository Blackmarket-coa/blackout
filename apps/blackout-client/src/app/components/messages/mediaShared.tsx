import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import { mxcToUrl } from '../../utils/media';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { BlackoutSdkError, MEDIA_TOO_LARGE } from '@blackout/sdk';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/compat-settings';
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
 * Latches true the first time `value` is true. While its row stays mounted,
 * media that has been on screen once is not thrown away and fetched again
 * each time it scrolls a little out of view and back. A row the timeline
 * unmounts (it keeps a window of rows around the viewport) loses its
 * decrypted copy, and gets it again when it is mounted again.
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

/** Shown for a `file` reference that has no usable URL, key, IV or hash. */
export const UNUSABLE_ENCRYPTED_FILE_ERROR =
    'This message refers to an encrypted file but does not carry a usable key.';

/**
 * Under a file that is within the server's reach in a room that is
 * end-to-end encrypted. Two ways that happens:
 *
 * - the file was uploaded as it was (a plain `url`). Every file sent from this
 *   app before 2026-11-16 is in this state, as is media posted by bridges and
 *   bots that do not encrypt;
 * - the file was encrypted, but the message that carries its key was not, so
 *   the server holds the key too.
 */
export const UNENCRYPTED_MEDIA_NOTE =
    'Not end-to-end encrypted: this file was sent without encryption, and the server can read it.';
export const EXPOSED_KEY_MEDIA_NOTE =
    "Not end-to-end encrypted: this file's key was sent in a message that was not encrypted, so the server can read the file.";

export interface ResolveMediaOptions {
    /**
     * Encrypted media only: fetch and decrypt without waiting for `load()`.
     * Unencrypted media is a URL and is never fetched here. The reader's
     * "Disable Media Auto Load" setting overrides this.
     */
    autoLoad: boolean;
}

export interface ResolvedMediaSource {
    /** A URL for `<img>`, `<audio>`, `<video>`: the media URL, or a blob URL of the decrypted file. */
    src: string | null;
    loading: boolean;
    error: string | null;
    /**
     * The message references its media through `file`, so it has to be
     * fetched and decrypted to be shown. This says nothing about who can read
     * the file: see `endToEndEncrypted`.
     */
    encrypted: boolean;
    /**
     * The media is referenced through `file` and the message that carries its
     * key was itself end-to-end encrypted. Only then is the file out of the
     * server's reach, and only then may the UI call it encrypted.
     */
    endToEndEncrypted: boolean;
    /** Encrypted and not fetched: waiting for `load()`. */
    awaitingLoad: boolean;
    /** Fetch and decrypt now, whatever the size. Asking again after a failure fetches again, from the start. */
    load: () => void;
    /** The load failed in a way that asking again could fix. */
    canRetry: boolean;
    /** An unasked fetch found more bytes than the message said there were. */
    sizeUnderstated: boolean;
    /** What to tell the reader when the room is encrypted and the server can read this file; null otherwise. */
    serverReadableNote: string | null;
}

type MediaOutcome = { event: MatrixEvent; src: string | null; error: string | null };

export const useResolvedMediaSource = (
    event: MatrixEvent,
    { autoLoad }: ResolveMediaOptions
): ResolvedMediaSource => {
    const client = useMatrixClient();
    const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
    // What the last fetch for a message came to. Held with the message it
    // belongs to, so nothing of one message is ever shown for another.
    const [outcome, setOutcome] = useState<MediaOutcome | null>(null);
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
    const homeserverUrl = homeserverUrlOf(client);

    const shouldDecrypt = requested || (autoLoad && mediaAutoLoad !== false && !autoRefused);

    useEffect(() => {
        if (!encryptedFile || !shouldDecrypt) return undefined;

        let active = true;
        let objectUrl: string | null = null;
        // Leaving the screen, or being asked for something else, stops the
        // download: a file nobody is waiting for is not fetched to the end.
        const controller = new AbortController();

        fetchDecryptedMedia({
            file: encryptedFile,
            homeserverUrl,
            blobType: inlineBlobType(declaredType),
            maxBytes: requested ? undefined : ENCRYPTED_AUTO_LOAD_MAX_BYTES,
            signal: controller.signal,
        })
            .then((blob) => {
                if (!active) return;
                objectUrl = URL.createObjectURL(blob);
                setOutcome({ event, src: objectUrl, error: null });
            })
            .catch((err: unknown) => {
                if (!active) return;
                if (!requested && err instanceof BlackoutSdkError && err.code === MEDIA_TOO_LARGE) {
                    // Larger than its message said. Not an error to show:
                    // the reader can still ask for it.
                    setAutoRefusedFor(event);
                    return;
                }
                setOutcome({ event, src: null, error: describeMediaError(err) });
            });

        return () => {
            active = false;
            controller.abort();
            if (objectUrl) {
                const released = objectUrl;
                URL.revokeObjectURL(released);
                // A released URL must not be handed out again.
                setOutcome((current) => (current?.src === released ? null : current));
            }
        };
    }, [attempt, declaredType, encryptedFile, event, homeserverUrl, requested, shouldDecrypt]);

    const load = useCallback(() => {
        setOutcome((current) => (current?.event === event ? null : current));
        setRequestedFor(event);
        setAttempt((n) => n + 1);
    }, [event]);

    const mine = outcome?.event === event ? outcome : null;
    let src: string | null = null;
    let error: string | null = null;
    let loading = false;
    if (!encrypted) {
        src = plainMxc ? mxcToUrl(plainMxc, homeserverUrl) : null;
        if (!src) error = plainMxc ? 'Invalid MXC URI' : 'Missing media URL';
    } else if (!encryptedFile) {
        error = UNUSABLE_ENCRYPTED_FILE_ERROR;
    } else {
        src = mine?.src ?? null;
        error = mine?.error ?? null;
        // Derived, not stored: between "decided to fetch" and "has a result"
        // there is no render in which neither the placeholder nor the media
        // is shown.
        loading = shouldDecrypt && !mine;
    }

    const endToEndEncrypted = Boolean(encryptedFile) && event.isEncrypted();
    let serverReadableNote: string | null = null;
    if (roomIsEncrypted(client, event)) {
        if (plainMxc) serverReadableNote = UNENCRYPTED_MEDIA_NOTE;
        else if (encrypted && !event.isEncrypted()) serverReadableNote = EXPOSED_KEY_MEDIA_NOTE;
    }

    return {
        src,
        loading,
        error,
        encrypted,
        endToEndEncrypted,
        awaitingLoad: Boolean(encryptedFile) && !shouldDecrypt,
        load,
        canRetry: Boolean(encryptedFile) && Boolean(mine?.error),
        sizeUnderstated: Boolean(encryptedFile) && autoRefused && !requested,
        serverReadableNote,
    };
};

/** The line under media the server can read in an encrypted room. */
export const ServerReadableNote = ({ text }: { text: string }) => (
    <div
        role="note"
        data-testid="unencrypted-media-note"
        style={{ color: 'var(--text-warning, var(--warning))', fontSize: 11, marginTop: 4 }}
    >
        {text}
    </div>
);

/**
 * A failed load, with a way to try again where trying again can help: a
 * fetch or a check that failed, not a message that carries no usable key.
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

/**
 * The label on the button that fetches an encrypted file the reader has to
 * ask for. It gives the size the message states, unless an unasked fetch
 * already found the file to be larger than that.
 */
export const loadEncryptedLabel = (
    kind: string,
    info: Record<string, unknown>,
    sizeUnderstated = false
): string => {
    if (sizeUnderstated) return `Load encrypted ${kind} (larger than its message says)`;
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
