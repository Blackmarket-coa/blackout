import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import { mxcToUrl } from '../../utils/bmc-media';
import { useMatrixClient } from '../../hooks/bmc-useMatrixClient';
import { BlackoutSdkError } from '@blackout/sdk';
import { mediaClient } from '../../sdk/client';

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

const getEncryptedFile = (event: MatrixEvent): Record<string, unknown> | null => {
    const content = event.getContent<Record<string, unknown>>();
    const file = content.file;
    return typeof file === 'object' && file !== null ? (file as Record<string, unknown>) : null;
};

const getMxcUrl = (event: MatrixEvent): string | null => {
    const content = event.getContent<Record<string, unknown>>();
    if (typeof content.url === 'string') return content.url;
    const file = getEncryptedFile(event);
    if (typeof file?.url === 'string') return file.url;
    return null;
};

export const getInfo = (event: MatrixEvent): Record<string, unknown> => {
    const content = event.getContent<Record<string, unknown>>();
    return typeof content.info === 'object' && content.info !== null
        ? (content.info as Record<string, unknown>)
        : {};
};

export const useResolvedMediaSource = (event: MatrixEvent) => {
    const client = useMatrixClient();
    const [src, setSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const mxc = useMemo(() => getMxcUrl(event), [event]);
    const encryptedFile = useMemo(() => getEncryptedFile(event), [event]);

    useEffect(() => {
        let active = true;
        let objectUrl: string | null = null;

        const resolveSource = async () => {
            if (!mxc) {
                setError('Missing media URL');
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);
            try {
                const homeserverUrl =
                    (
                        client as unknown as { getHomeserverUrl?: () => string }
                    ).getHomeserverUrl?.() ?? '';
                const directUrl = mxcToUrl(mxc, homeserverUrl);
                if (!directUrl) throw new Error('Invalid MXC URI');

                if (!encryptedFile) {
                    if (active) setSrc(directUrl);
                    return;
                }

                const encryptedBuffer = await mediaClient.fetchArrayBuffer(directUrl);
                const decrypt = (
                    client as unknown as {
                        decryptMedia?: (
                            data: ArrayBuffer,
                            file: Record<string, unknown>
                        ) => Promise<ArrayBuffer>;
                    }
                ).decryptMedia;
                if (!decrypt) {
                    throw new Error('Encrypted media not supported by current client runtime');
                }

                const decrypted = await decrypt(encryptedBuffer, encryptedFile);
                objectUrl = URL.createObjectURL(new Blob([decrypted]));
                if (active) setSrc(objectUrl);
            } catch (err) {
                if (active) {
                    setSrc(null);
                    if (err instanceof BlackoutSdkError && err.kind === 'retryable') {
                        setError(`${err.message} Retrying may succeed.`);
                    } else {
                        setError(err instanceof Error ? err.message : 'Failed to load media');
                    }
                }
            } finally {
                if (active) setLoading(false);
            }
        };

        void resolveSource();

        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [client, encryptedFile, mxc]);

    return { src, loading, error, encrypted: Boolean(encryptedFile) };
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
