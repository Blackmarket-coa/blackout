import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import { MAX_PERTURBATION_BYTES, perturbationClient } from '../integrations/perturbation-client';

const media = new Hono();

// Perturbation is CPU/GPU-heavy on the sidecar; rate-limit it per user.
media.use('/perturb', authRateLimit);

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

const perturbSchema = z.object({
  mimetype: z.enum(ALLOWED_MIME),
  // base64 image payload; bounded so we don't buffer unbounded request bodies.
  image: z
    .string()
    .min(1)
    .max(Math.ceil((MAX_PERTURBATION_BYTES * 4) / 3) + 1024),
});

/**
 * Perturb an image via the Fawkes/Glaze sidecar. Returns the perturbed image
 * (base64) on success. When the sidecar isn't configured we return 503 so the
 * client falls back to its own best-effort client-side perturbation rather
 * than blocking the upload.
 */
media.post('/perturb', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const parsed = await readJsonBody(c, perturbSchema);
  if (parsed instanceof Response) return parsed;

  const result = await perturbationClient.perturb(parsed.image, parsed.mimetype);
  if (result.ok) {
    return c.json({ image: result.image, mimetype: result.mimetype });
  }

  switch (result.reason) {
    case 'not_configured':
      return c.json(
        {
          code: 'perturbation_unavailable',
          message: 'Perturbation sidecar is not configured; fall back to client-side.',
        },
        503,
      );
    case 'too_large':
      return c.json({ code: 'payload_too_large', message: 'Image exceeds the perturbation size limit.' }, 413);
    default:
      return c.json(
        {
          code: 'perturbation_failed',
          message: 'The perturbation sidecar could not process this image.',
          reason: result.reason,
          detail: result.detail,
        },
        502,
      );
  }
});

export default media;
