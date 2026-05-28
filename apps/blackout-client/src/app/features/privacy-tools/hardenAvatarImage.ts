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
 * optional perturbation. Perturbation prefers the server-side sidecar (real
 * Fawkes/Glaze when deployed) and falls back to the best-effort client-side
 * transform when the service is unavailable. Because perturbation re-encodes
 * through canvas/the sidecar, it also strips metadata — so when both are on we
 * skip the redundant strip pass.
 *
 * Non-raster types (GIF/SVG/PDF/video) pass through untouched.
 */
export const hardenAvatarImage = async (
    file: File,
    options: HardenAvatarOptions
): Promise<File> => {
    if (options.perturb && isPerturbableImage(file)) {
        const viaService = await perturbViaService(file);
        if (viaService) return viaService;
        return perturbImageClientSide(file);
    }
    if (options.stripMetadata) {
        return stripImageMetadata(file);
    }
    return file;
};
