/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { createHmac, timingSafeEqual } from "crypto";

const SIGNATURE_VERSION = "cosmetic-pack-signature-v1";

export interface CosmeticAsset {
    id: string;
    kind: "sticker" | "theme" | "frame";
    payload: string;
}

export interface CosmeticPackManifest {
    packId: string;
    version: string;
    publisherId: string;
    displayName: string;
    assets: CosmeticAsset[];
}

export interface SignedCosmeticPack {
    manifest: CosmeticPackManifest;
    signature: string;
    signerKeyId: string;
    signatureVersion: typeof SIGNATURE_VERSION;
}

export interface MarketplacePublicationRequest {
    pack: SignedCosmeticPack;
    requestedBy: string;
    reviewTicket: string;
}

export interface MarketplacePublicationRecord {
    packId: string;
    version: string;
    publishedBy: string;
    reviewTicket: string;
    publishedAtMs: number;
}

export interface CosmeticPackPipelineOptions {
    signingSecretsByKeyId: Record<string, string>;
    approvedPublishers: string[];
}

export class CosmeticPackPipelineConformanceError extends Error {}

const sortAssets = (assets: CosmeticAsset[]): CosmeticAsset[] =>
    [...assets].sort((left, right) => {
        if (left.id !== right.id) {
            return left.id < right.id ? -1 : 1;
        }

        if (left.kind !== right.kind) {
            return left.kind < right.kind ? -1 : 1;
        }

        return left.payload < right.payload ? -1 : left.payload > right.payload ? 1 : 0;
    });

const canonicalizeManifest = (manifest: CosmeticPackManifest): string =>
    JSON.stringify({
        packId: manifest.packId,
        version: manifest.version,
        publisherId: manifest.publisherId,
        displayName: manifest.displayName,
        assets: sortAssets(manifest.assets),
    });

export class CosmeticPackPipeline {
    private readonly signingSecretsByKeyId: Map<string, string>;
    private readonly approvedPublishers: Set<string>;
    private readonly publishedPackVersions = new Map<string, MarketplacePublicationRecord>();

    public constructor(options: CosmeticPackPipelineOptions) {
        if (!Object.keys(options.signingSecretsByKeyId).length) {
            throw new CosmeticPackPipelineConformanceError("At least one signing key must be configured");
        }

        this.signingSecretsByKeyId = new Map(Object.entries(options.signingSecretsByKeyId));
        this.approvedPublishers = new Set(options.approvedPublishers);
    }

    public signPack(manifest: CosmeticPackManifest, signerKeyId: string): SignedCosmeticPack {
        this.assertManifestConformance(manifest);
        const secret = this.signingSecretsByKeyId.get(signerKeyId);
        if (!secret) {
            throw new CosmeticPackPipelineConformanceError(`Unknown signing key: ${signerKeyId}`);
        }

        const manifestSnapshot = this.createManifestSnapshot(manifest);

        return {
            manifest: manifestSnapshot,
            signerKeyId,
            signatureVersion: SIGNATURE_VERSION,
            signature: this.computeSignature(manifestSnapshot, secret),
        };
    }

    public verifySignedPack(pack: SignedCosmeticPack): boolean {
        try {
            this.assertManifestConformance(pack.manifest);
        } catch {
            return false;
        }

        if (pack.signatureVersion !== SIGNATURE_VERSION) {
            return false;
        }

        const secret = this.signingSecretsByKeyId.get(pack.signerKeyId);
        if (!secret) {
            return false;
        }

        if (!/^[a-f0-9]{64}$/i.test(pack.signature)) {
            return false;
        }

        const expected = Buffer.from(this.computeSignature(pack.manifest, secret), "hex");
        const received = Buffer.from(pack.signature, "hex");

        return expected.length === received.length && timingSafeEqual(expected, received);
    }

    public publishPack(request: MarketplacePublicationRequest): MarketplacePublicationRecord {
        const { pack, requestedBy, reviewTicket } = request;

        if (!this.approvedPublishers.has(requestedBy)) {
            throw new CosmeticPackPipelineConformanceError(
                `Publisher ${requestedBy} is not approved for marketplace publication`,
            );
        }

        if (pack.manifest.publisherId !== requestedBy) {
            throw new CosmeticPackPipelineConformanceError(
                `Requested publisher ${requestedBy} does not match pack publisher ${pack.manifest.publisherId}`,
            );
        }

        if (!reviewTicket.trim()) {
            throw new CosmeticPackPipelineConformanceError("Marketplace publication requires a non-empty review ticket");
        }

        if (!this.verifySignedPack(pack)) {
            throw new CosmeticPackPipelineConformanceError("Pack signature verification failed for marketplace publication");
        }

        const publicationKey = this.getPublicationKey(pack.manifest.packId, pack.manifest.version);
        if (this.publishedPackVersions.has(publicationKey)) {
            throw new CosmeticPackPipelineConformanceError(
                `Pack ${pack.manifest.packId}@${pack.manifest.version} is already published`,
            );
        }

        const publicationRecord: MarketplacePublicationRecord = {
            packId: pack.manifest.packId,
            version: pack.manifest.version,
            publishedBy: requestedBy,
            reviewTicket,
            publishedAtMs: Date.now(),
        };

        this.publishedPackVersions.set(publicationKey, publicationRecord);
        return publicationRecord;
    }

    public listPublishedPacks(): MarketplacePublicationRecord[] {
        return [...this.publishedPackVersions.values()].sort((left, right) => {
            if (left.packId !== right.packId) {
                return left.packId < right.packId ? -1 : 1;
            }

            if (left.version !== right.version) {
                return left.version < right.version ? -1 : 1;
            }

            return left.publishedAtMs - right.publishedAtMs;
        });
    }

    private computeSignature(manifest: CosmeticPackManifest, secret: string): string {
        const canonicalManifest = canonicalizeManifest(manifest);
        return createHmac("sha256", secret).update(canonicalManifest).digest("hex");
    }

    private assertManifestConformance(manifest: CosmeticPackManifest): void {
        if (!manifest.packId || !manifest.version || !manifest.publisherId || !manifest.displayName) {
            throw new CosmeticPackPipelineConformanceError(
                "Cosmetic pack manifest must include packId, version, publisherId, and displayName",
            );
        }

        if (!manifest.assets.length) {
            throw new CosmeticPackPipelineConformanceError("Cosmetic pack must include at least one asset");
        }

        for (const asset of manifest.assets) {
            if (!asset.id || !asset.payload) {
                throw new CosmeticPackPipelineConformanceError(
                    `Cosmetic pack asset must include id and payload: ${JSON.stringify(asset)}`,
                );
            }

            if (asset.kind !== "sticker" && asset.kind !== "theme" && asset.kind !== "frame") {
                throw new CosmeticPackPipelineConformanceError(
                    `Cosmetic pack asset has unsupported kind: ${JSON.stringify(asset)}`,
                );
            }
        }

        const assetIds = manifest.assets.map((asset) => asset.id);
        if (new Set(assetIds).size !== assetIds.length) {
            throw new CosmeticPackPipelineConformanceError("Cosmetic pack assets must have unique ids");
        }
    }

    private createManifestSnapshot(manifest: CosmeticPackManifest): CosmeticPackManifest {
        return {
            packId: manifest.packId,
            version: manifest.version,
            publisherId: manifest.publisherId,
            displayName: manifest.displayName,
            assets: manifest.assets.map((asset) => ({
                id: asset.id,
                kind: asset.kind,
                payload: asset.payload,
            })),
        };
    }

    private getPublicationKey(packId: string, version: string): string {
        return `${packId}@${version}`;
    }
}
