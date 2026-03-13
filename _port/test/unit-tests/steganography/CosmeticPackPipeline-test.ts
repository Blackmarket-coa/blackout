/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import {
    CosmeticPackPipeline,
    CosmeticPackPipelineConformanceError,
    type CosmeticPackManifest,
} from "../../../src/steganography/plugins/CosmeticPackPipeline";

describe("CosmeticPackPipeline", () => {
    const manifest: CosmeticPackManifest = {
        packId: "aurora-pack",
        version: "1.2.0",
        publisherId: "publisher:cosmetics",
        displayName: "Aurora Set",
        assets: [
            {
                id: "asset-theme-1",
                kind: "theme",
                payload: "theme://aurora",
            },
            {
                id: "asset-frame-1",
                kind: "frame",
                payload: "frame://aurora",
            },
        ],
    };

    const createPipeline = () =>
        new CosmeticPackPipeline({
            signingSecretsByKeyId: {
                "signing-key-a": "top-secret-a",
                "signing-key-b": "top-secret-b",
            },
            approvedPublishers: ["publisher:cosmetics"],
        });

    it("signs and verifies a conformant cosmetic pack", () => {
        const pipeline = createPipeline();
        const pack = pipeline.signPack(manifest, "signing-key-a");

        expect(pack.signatureVersion).toBe("cosmetic-pack-signature-v1");
        expect(pipeline.verifySignedPack(pack)).toBe(true);
    });

    it("fails verification when payload is tampered after signing", () => {
        const pipeline = createPipeline();
        const pack = pipeline.signPack(manifest, "signing-key-a");

        pack.manifest.assets[0] = {
            ...pack.manifest.assets[0],
            payload: "theme://malicious",
        };

        expect(pipeline.verifySignedPack(pack)).toBe(false);
    });

    it("publishes only verified packs from approved publishers with review ticket controls", () => {
        const pipeline = createPipeline();
        const pack = pipeline.signPack(manifest, "signing-key-a");

        const publication = pipeline.publishPack({
            pack,
            requestedBy: "publisher:cosmetics",
            reviewTicket: "security-review-2026-0312",
        });

        expect(publication.packId).toBe("aurora-pack");
        expect(publication.publishedBy).toBe("publisher:cosmetics");
        expect(publication.reviewTicket).toBe("security-review-2026-0312");
        expect(publication.publishedAtMs).toBeGreaterThan(0);
    });

    it("rejects publication for non-approved publishers", () => {
        const pipeline = createPipeline();
        const pack = pipeline.signPack(manifest, "signing-key-a");

        expect(() =>
            pipeline.publishPack({
                pack,
                requestedBy: "publisher:rogue",
                reviewTicket: "security-review-2026-0312",
            }),
        ).toThrow(CosmeticPackPipelineConformanceError);
    });

    it("rejects publication when review ticket is missing", () => {
        const pipeline = createPipeline();
        const pack = pipeline.signPack(manifest, "signing-key-a");

        expect(() =>
            pipeline.publishPack({
                pack,
                requestedBy: "publisher:cosmetics",
                reviewTicket: "   ",
            }),
        ).toThrow(CosmeticPackPipelineConformanceError);
    });
});
