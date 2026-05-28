/**
 * Client-side image perturbation (best-effort, NOT Fawkes-grade).
 *
 * Applies a low-amplitude, structured pixel perturbation to a raster image:
 * deterministic high-frequency noise plus a faint sinusoidal pattern. This is a
 * real transform that subtly alters every pixel — enough to be a meaningful
 * seam and to degrade naive perceptual hashing — but it does NOT defeat
 * state-of-the-art facial-recognition models. The intended upgrade is a
 * server-side Fawkes/Glaze sidecar (see perturbationClient); this is the
 * no-infra fallback. Callers must label it honestly in the UI.
 *
 * Like stripImageMetadata, re-encoding through canvas also discards EXIF.
 */

const STRIPPABLE_MIME = new Set<string>(['image/jpeg', 'image/png', 'image/webp']);

const canProcess = (file: File): boolean =>
    STRIPPABLE_MIME.has(file.type) &&
    typeof createImageBitmap === 'function' &&
    typeof document !== 'undefined';

/** Default perturbation strength (max per-channel delta, 0-255 scale). */
const DEFAULT_AMPLITUDE = 6;

/**
 * Return a perturbed copy of `file`, or the original unchanged when the type
 * can't be processed (GIF/SVG/PDF/video) or canvas APIs are unavailable.
 */
export const perturbImageClientSide = async (
    file: File,
    amplitude: number = DEFAULT_AMPLITUDE
): Promise<File> => {
    if (!canProcess(file)) return file;

    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        return file;
    }

    try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0);

        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = image.data;
        const amp = Math.max(1, Math.min(32, Math.floor(amplitude)));

        // Deterministic LCG so the perturbation is reproducible per pixel and
        // doesn't depend on Math.random (stable across calls / testable).
        let seed = (canvas.width * 2654435761 + canvas.height * 40503) >>> 0;
        const nextUnit = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 0xffffffff;
        };

        for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
                const i = (y * canvas.width + x) * 4;
                // High-frequency checker + faint sinusoid + per-pixel noise.
                const checker = ((x + y) & 1) === 0 ? 1 : -1;
                const wave = Math.sin((x * 12.9898 + y * 78.233) * 0.5);
                const noise = nextUnit() * 2 - 1;
                const delta = Math.round((checker * 0.4 + wave * 0.3 + noise * 0.3) * amp);
                data[i] = clamp(data[i] + delta);
                data[i + 1] = clamp(data[i + 1] - delta);
                data[i + 2] = clamp(data[i + 2] + delta);
                // leave alpha (i+3) untouched
            }
        }
        ctx.putImageData(image, 0, 0);

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((result) => resolve(result), file.type, 0.92);
        });
        if (!blob) return file;

        return new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
    } catch {
        return file;
    } finally {
        bitmap.close();
    }
};

const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

export const isPerturbableImage = (file: File): boolean => STRIPPABLE_MIME.has(file.type);
