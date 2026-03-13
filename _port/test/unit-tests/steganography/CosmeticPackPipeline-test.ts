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

    it("keeps signed pack manifest immutable from subsequent source-manifest changes", () => {
        const pipeline = createPipeline();
        const sourceManifest: CosmeticPackManifest = {
            ...manifest,
            assets: manifest.assets.map((asset) => ({ ...asset })),
        };

        const pack = pipeline.signPack(sourceManifest, "signing-key-a");
        sourceManifest.assets[0] = {
            ...sourceManifest.assets[0],
            payload: "theme://source-mutated-after-sign",
        };

        expect(pack.manifest.assets[0].payload).toBe("theme://aurora");
        expect(pipeline.verifySignedPack(pack)).toBe(true);
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

    it("rejects duplicate publication for the same pack version", () => {
        const pipeline = createPipeline();
        const pack = pipeline.signPack(manifest, "signing-key-a");

        pipeline.publishPack({
            pack,
            requestedBy: "publisher:cosmetics",
            reviewTicket: "security-review-2026-0312",
        });

        expect(() =>
            pipeline.publishPack({
                pack,
                requestedBy: "publisher:cosmetics",
                reviewTicket: "security-review-2026-0313",
            }),
        ).toThrow(CosmeticPackPipelineConformanceError);
    });

    it("returns deterministic published-pack inventory", () => {
        const pipeline = createPipeline();
        const packV1 = pipeline.signPack(manifest, "signing-key-a");
        const packV2 = pipeline.signPack({ ...manifest, version: "1.3.0" }, "signing-key-a");

        pipeline.publishPack({
            pack: packV2,
            requestedBy: "publisher:cosmetics",
            reviewTicket: "security-review-2026-0314",
        });
        pipeline.publishPack({
            pack: packV1,
            requestedBy: "publisher:cosmetics",
            reviewTicket: "security-review-2026-0312",
        });

        expect(pipeline.listPublishedPacks().map((record) => record.version)).toEqual(["1.2.0", "1.3.0"]);
    });
});
