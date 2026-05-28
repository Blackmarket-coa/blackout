// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/app/utils/stripImageMetadata', () => ({
    stripImageMetadata: vi.fn(
        async (f: File) => new File([f], `stripped-${f.name}`, { type: f.type })
    ),
}));
vi.mock('../../../../src/app/utils/perturbImage', () => ({
    isPerturbableImage: (f: File) => f.type.startsWith('image/'),
    perturbImageClientSide: vi.fn(
        async (f: File) => new File([f], `client-${f.name}`, { type: f.type })
    ),
}));
vi.mock('../../../../src/app/features/privacy-tools/perturbationClient', () => ({
    perturbViaService: vi.fn(async () => null),
}));

const { hardenAvatarImage } = await import(
    '../../../../src/app/features/privacy-tools/hardenAvatarImage'
);
const { stripImageMetadata } = await import('../../../../src/app/utils/stripImageMetadata');
const { perturbImageClientSide } = await import('../../../../src/app/utils/perturbImage');
const { perturbViaService } = await import(
    '../../../../src/app/features/privacy-tools/perturbationClient'
);

const file = (name = 'a.png', type = 'image/png') =>
    new File([new Uint8Array([1])], name, { type });

afterEach(() => vi.clearAllMocks());

describe('hardenAvatarImage', () => {
    it('returns the original when nothing is enabled', async () => {
        const f = file();
        expect(await hardenAvatarImage(f, { stripMetadata: false, perturb: false })).toBe(f);
        expect(stripImageMetadata).not.toHaveBeenCalled();
    });

    it('strips metadata when only stripMetadata is on', async () => {
        const result = await hardenAvatarImage(file(), { stripMetadata: true, perturb: false });
        expect(result.name).toBe('stripped-a.png');
        expect(perturbViaService).not.toHaveBeenCalled();
    });

    it('prefers the server perturbation when available', async () => {
        (perturbViaService as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
            new File([new Uint8Array([9])], 'server-a.png', { type: 'image/png' })
        );
        const result = await hardenAvatarImage(file(), { stripMetadata: true, perturb: true });
        expect(result.name).toBe('server-a.png');
        expect(perturbImageClientSide).not.toHaveBeenCalled();
    });

    it('falls back to client-side perturbation when the service returns null', async () => {
        const result = await hardenAvatarImage(file(), { stripMetadata: false, perturb: true });
        expect(perturbViaService).toHaveBeenCalled();
        expect(result.name).toBe('client-a.png');
    });

    it('does not perturb non-raster files even when perturb is on', async () => {
        const pdf = file('a.pdf', 'application/pdf');
        // perturb requested but not perturbable → falls through to strip (off) → original
        const result = await hardenAvatarImage(pdf, { stripMetadata: false, perturb: true });
        expect(result).toBe(pdf);
        expect(perturbViaService).not.toHaveBeenCalled();
    });
});
