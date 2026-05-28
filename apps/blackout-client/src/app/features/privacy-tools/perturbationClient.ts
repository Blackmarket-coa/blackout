import { createFetchApiClient } from '@blackout/sdk';
import { API_BASE_URL } from '../../sdk/apiBaseUrl';
import { ensureBlackoutApiToken } from '../../../client/blackoutApiSession';

/**
 * Calls the server-side perturbation endpoint (`POST /v1/media/perturb`), which
 * proxies to the Fawkes/Glaze sidecar when configured. Returns a perturbed File
 * on success, or `null` when the caller should fall back to the client-side
 * perturbation (no token, service not configured → 503, or any error). The
 * image rides as base64 JSON to avoid a multipart path the SDK client doesn't
 * expose.
 */
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
};

const base64ToBlob = (base64: string, type: string): Blob => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
};

interface PerturbResponse {
    image: string;
    mimetype: string;
}

export const perturbViaService = async (file: File): Promise<File | null> => {
    const token = await ensureBlackoutApiToken();
    if (!token) return null;

    try {
        const client = createFetchApiClient({
            baseUrl: API_BASE_URL,
            defaultHeaders: { Authorization: `Bearer ${token}` },
        });
        const result = (await client({
            method: 'POST',
            path: '/v1/media/perturb',
            body: {
                mimetype: file.type,
                image: arrayBufferToBase64(await file.arrayBuffer()),
            },
        })) as PerturbResponse;

        if (!result?.image) return null;
        const blob = base64ToBlob(result.image, result.mimetype || file.type);
        return new File([blob], file.name, {
            type: result.mimetype || file.type,
            lastModified: file.lastModified,
        });
    } catch {
        return null;
    }
};
