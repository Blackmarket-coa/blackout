const serviceUrl = (): string | null => {
    const raw = process.env.PERTURBATION_SERVICE_URL?.trim();
    if (!raw) return null;
    try {
        const url = new URL(raw);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return raw;
    } catch {
        return null;
    }
};

/** Max image bytes accepted for perturbation (base64-decoded). Keeps the sidecar bounded. */
export const MAX_PERTURBATION_BYTES = 8 * 1024 * 1024; // 8 MiB

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIDECAR_RESPONSE_BYTES = 16 * 1024 * 1024; // 16 MiB

export type PerturbResult =
    | { ok: true; image: string; mimetype: string }
    | { ok: false; reason: 'not_configured' | 'network_error' | 'service_rejected' | 'too_large'; status?: number; detail?: string };

async function readBoundedResponse(response: Response): Promise<string> {
    const contentLength = response.headers.get('content-length');
    const expectedSize = contentLength ? parseInt(contentLength, 10) : 0;
    if (Number.isFinite(expectedSize) && expectedSize > MAX_SIDECAR_RESPONSE_BYTES) {
        throw new Error('response too large');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('no readable body');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_SIDECAR_RESPONSE_BYTES) throw new Error('response too large');
        chunks.push(value);
    }
    const all = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.length;
    }
    return new TextDecoder().decode(all);
}

/**
 * Proxy an image to the perturbation sidecar (Fawkes/Glaze when deployed).
 * The sidecar contract is `POST {PERTURBATION_SERVICE_URL}/perturb` with
 * `{ image: <base64>, mimetype }` returning `{ image: <base64>, mimetype }`.
 * When the service isn't configured the caller should fall back to the
 * client-side perturbation rather than failing the upload.
 */
export const perturbationClient = {
    configured(): boolean {
        return Boolean(serviceUrl());
    },

    async perturb(imageBase64: string, mimetype: string): Promise<PerturbResult> {
        const base = serviceUrl();
        if (!base) return { ok: false, reason: 'not_configured' };

        if ((imageBase64.length * 3) / 4 > MAX_PERTURBATION_BYTES) {
            return { ok: false, reason: 'too_large' };
        }

        let response: Response;
        try {
            response = await fetch(`${base.replace(/\/+$/, '')}/perturb`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(process.env.PERTURBATION_TOKEN ? { 'X-Perturbation-Token': process.env.PERTURBATION_TOKEN } : {}),
                },
                body: JSON.stringify({ image: imageBase64, mimetype }),
            });
        } catch (error) {
            return { ok: false, reason: 'network_error' };
        }

        if (!response.ok) {
            const detail = await readBoundedResponse(response).catch(() => 'sidecar error');
            const safeDetail = detail.length > 256 ? `${detail.slice(0, 253)}...` : detail;
            return { ok: false, reason: 'service_rejected', status: response.status, detail: safeDetail };
        }

        const raw = await readBoundedResponse(response);
        let json: { image?: string; mimetype?: string };
        try { json = JSON.parse(raw); } catch { return { ok: false, reason: 'service_rejected', status: response.status }; }

        if (!json.image || typeof json.image !== 'string') {
            return { ok: false, reason: 'service_rejected', status: response.status };
        }

        const mime = typeof json.mimetype === 'string' && ALLOWED_MIME.has(json.mimetype) ? json.mimetype : mimetype;

        if ((json.image.length * 3) / 4 > MAX_PERTURBATION_BYTES) {
            return { ok: false, reason: 'too_large' };
        }

        return { ok: true, image: json.image, mimetype: mime };
    },
};
