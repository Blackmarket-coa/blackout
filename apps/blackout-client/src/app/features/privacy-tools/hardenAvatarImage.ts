import { stripImageMetadata } from '../../utils/stripImageMetadata';
import { isPerturbableImage, perturbImageClientSide } from '../../utils/perturbImage';
import { perturbViaService } from './perturbationClient';

export interface HardenAvatarOptions {
    /** Strip EXIF/metadata (canvas re-encode). */
    stripMetadata: boolean;
    /** Apply anti-facial-recognition perturbation. */
    perturb: boolean;
}

/**
 * Harden an avatar/image before upload: optional metadata stripping plus
 * optional perturbation. Perturbation prefers the server-side sidecar and
 * falls back to the best-effort client-side transform when the service is
 * unavailable; neither stops current face recognition (see perturbImage.ts and
 * services/perturbation/README.md).
 *
 * Metadata is stripped first, on the device, and only the cleaned copy is
 * perturbed. The sidecar is reached through the Blackout API, and until
 * 2026-11-16 it was sent the picture as it was picked, with its metadata
 * (docs/security/trust-claims-2026-11-16.md, T12).
 *
 * Non-raster types (GIF/SVG/PDF/video) pass through untouched.
 */
export const hardenAvatarImage = async (
    file: File,
    options: HardenAvatarOptions
): Promise<File> => {
    const cleanedFile = options.stripMetadata ? await stripImageMetadata(file) : file;
    if (options.perturb && isPerturbableImage(cleanedFile)) {
        const viaService = await perturbViaService(cleanedFile);
        if (viaService) return viaService;
        return perturbImageClientSide(cleanedFile);
    }
    return cleanedFile;
};
