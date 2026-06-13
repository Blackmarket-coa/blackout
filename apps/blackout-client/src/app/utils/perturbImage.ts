/**
 * Client-side image perturbation (best-effort, NOT lab-grade).
 *
 * Applies a low-amplitude, deterministic, structured perturbation to a raster
 * image. The transform is:
 *   - **chroma-weighted** — most energy is pushed oppositely on the R/B
 *     channels (a Cb/Cr proxy) with only a fraction on G (luma), so the
 *     distortion is less visible to humans but more disruptive to models that
 *     key on chroma statistics;
 *   - **edge-gated** — a cheap Sobel magnitude concentrates perturbation on
 *     luminance edges (where recognition features live) and leaves flat
 *     regions nearly untouched, improving disruption-per-visible-distortion;
 *   - **structured** — a sum of oriented sinusoids (seeded deterministically by
 *     the image dimensions) rather than white noise, so it is reproducible and
 *     unit-testable.
 * The net per-channel delta is hard-clamped to ±amplitude.
 *
 * This is a real transform that meaningfully alters the image and degrades
 * naive perceptual hashing, but it does NOT defeat state-of-the-art
 * facial-recognition models — the intended upgrade is the server-side
 * Fawkes/Glaze sidecar (see perturbationClient). Callers must label it
 * honestly in the UI. Like stripImageMetadata, re-encoding discards EXIF.
 */

const STRIPPABLE_MIME = new Set<string>(['image/jpeg', 'image/png', 'image/webp']);

const canProcess = (file: File): boolean =>
    STRIPPABLE_MIME.has(file.type) &&
    typeof createImageBitmap === 'function' &&
    typeof document !== 'undefined';

/** Default + maximum per-channel delta (0-255 scale). Kept low for subtlety. */
const DEFAULT_AMPLITUDE = 8;
const MAX_AMPLITUDE = 8;

const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);
const clampDelta = (d: number, amp: number): number => (d < -amp ? -amp : d > amp ? amp : d);

const lumaAt = (
    data: Uint8ClampedArray,
    x: number,
    y: number,
    width: number,
    height: number
): number => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    const i = (cy * width + cx) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
};

/** Normalized [0,1] Sobel-ish edge magnitude on luma at (x, y). */
const edgeMagnitude = (
    data: Uint8ClampedArray,
    x: number,
    y: number,
    width: number,
    height: number
): number => {
    const gx = lumaAt(data, x + 1, y, width, height) - lumaAt(data, x - 1, y, width, height);
    const gy = lumaAt(data, x, y + 1, width, height) - lumaAt(data, x, y - 1, width, height);
    return Math.min(1, Math.sqrt(gx * gx + gy * gy) / 255);
};

/**
 * In-place perturbation of an RGBA pixel buffer. Pure and deterministic — the
 * unit-testable core of `perturbImageClientSide`. Alpha is never modified and
 * every channel stays within ±amplitude of its input value.
 */
export const perturbPixels = (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    amplitude: number = DEFAULT_AMPLITUDE
): void => {
    if (width <= 0 || height <= 0) return;
    const amp = Math.max(1, Math.min(MAX_AMPLITUDE, Math.floor(amplitude)));
    const seed = (width * 2654435761 + height * 40503) >>> 0;
    const phase = ((seed % 1000) / 1000) * Math.PI * 2;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4;
            // Sum of oriented sinusoids → structured pattern in [-1, 1].
            const g1 = Math.sin(x * 0.21 + y * 0.13 + phase);
            const g2 = Math.sin(x * 0.07 - y * 0.29 + phase * 1.7);
            const g3 = Math.sin((x + y) * 0.5);
            const pattern = g1 * 0.4 + g2 * 0.35 + g3 * 0.25;
            const gate = 0.35 + 0.65 * edgeMagnitude(data, x, y, width, height);
            const base = pattern * gate * amp;
            // Chroma-weighted: opposite push on R/B, a fraction on G.
            data[i] = clamp(data[i] + clampDelta(Math.round(base), amp));
            data[i + 1] = clamp(data[i + 1] + clampDelta(Math.round(base * 0.25), amp));
            data[i + 2] = clamp(data[i + 2] + clampDelta(Math.round(-base), amp));
            // alpha (i + 3) untouched
        }
    }
};

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
        perturbPixels(image.data, canvas.width, canvas.height, amplitude);
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

export const isPerturbableImage = (file: File): boolean => STRIPPABLE_MIME.has(file.type);
