const serviceUrl = () => process.env.PERTURBATION_SERVICE_URL;

/** Max image bytes accepted for perturbation (base64-decoded). Keeps the sidecar bounded. */
export const MAX_PERTURBATION_BYTES = 8 * 1024 * 1024; // 8 MiB

export type PerturbResult =
  | { ok: true; image: string; mimetype: string }
  | { ok: false; reason: 'not_configured' | 'network_error' | 'service_rejected' | 'too_large'; status?: number; detail?: string };

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

    // Guard size before shipping to the sidecar (base64 ≈ 4/3 of raw bytes).
    if ((imageBase64.length * 3) / 4 > MAX_PERTURBATION_BYTES) {
      return { ok: false, reason: 'too_large' };
    }

    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/+$/, '')}/perturb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageBase64, mimetype }),
      });
    } catch (error) {
      return { ok: false, reason: 'network_error', detail: (error as Error).message };
    }

    if (!response.ok) {
      let detail: string | undefined;
      try {
        detail = await response.text();
      } catch {
        /* ignore */
      }
      return { ok: false, reason: 'service_rejected', status: response.status, detail };
    }

    const json = (await response.json()) as { image?: string; mimetype?: string };
    if (!json.image) {
      return { ok: false, reason: 'service_rejected', status: response.status };
    }
    return { ok: true, image: json.image, mimetype: json.mimetype ?? mimetype };
  },
};
