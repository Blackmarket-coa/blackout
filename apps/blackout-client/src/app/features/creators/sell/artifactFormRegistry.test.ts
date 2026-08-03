import { describe, expect, it } from 'vitest';
import {
    validateArtifactPayload,
    cosmeticTypes,
    soundKinds,
    streamAssetTypes,
    vaultKinds,
    privacyTiers,
} from '@blackout/core';
import {
    ARTIFACT_FORM_REGISTRY,
    DIGITAL_DOWNLOAD_DESCRIPTOR,
    SELL_TEMPLATE_ORDER,
    getSellTemplate,
    listSellTemplates,
    parseJsonField,
    toStringArray,
} from './artifactFormRegistry';
import { categoryForArtifact, entitlementForArtifact } from '../creatorArtifactMap';

describe('artifactFormRegistry', () => {
    it('covers all 12 sellable kinds plus the digital-download preset', () => {
        expect(SELL_TEMPLATE_ORDER).toHaveLength(12);
        const templates = listSellTemplates();
        expect(templates).toHaveLength(13);
        expect(templates[0]).toBe(DIGITAL_DOWNLOAD_DESCRIPTOR);
    });

    it('derives category/entitlement from the canonical artifact map', () => {
        for (const kind of SELL_TEMPLATE_ORDER) {
            const descriptor = ARTIFACT_FORM_REGISTRY[kind];
            expect(descriptor.category).toBe(categoryForArtifact(kind));
            expect(descriptor.entitlementKind).toBe(entitlementForArtifact(kind));
        }
    });

    it('buildPayload(defaults) passes the server discriminant validation for every template', () => {
        for (const descriptor of listSellTemplates()) {
            const payload = descriptor.buildPayload(descriptor.defaults);
            expect(payload).toBeTypeOf('object');
            // validateArtifactPayload throws on an invalid discriminant — a guided
            // form must never be able to build a payload the server would reject.
            expect(() => validateArtifactPayload(descriptor.kind, payload)).not.toThrow();
        }
    });

    it('sources select options from the core discriminant enums', () => {
        const optionsFor = (kind: keyof typeof ARTIFACT_FORM_REGISTRY, key: string) =>
            ARTIFACT_FORM_REGISTRY[kind].fields.find((f) => f.key === key)?.options;
        expect(optionsFor('profile_cosmetic', 'cosmeticType')).toEqual(cosmeticTypes);
        expect(optionsFor('sound_pack', 'soundKind')).toEqual(soundKinds);
        expect(optionsFor('stream_asset', 'assetType')).toEqual(streamAssetTypes);
        expect(optionsFor('vault_item', 'vaultKind')).toEqual(vaultKinds);
        expect(optionsFor('privacy_tool', 'tier')).toEqual(privacyTiers);
    });

    it('builds the expected privacy_tool payload from field values', () => {
        const payload = ARTIFACT_FORM_REGISTRY.privacy_tool.buildPayload({
            tier: 'advanced',
            features: 'exif_strip, link_sanitize',
        });
        expect(payload).toEqual({ tier: 'advanced', features: ['exif_strip', 'link_sanitize'] });
    });

    it('builds the digital-download files payload', () => {
        const files = [{ name: 'guide.pdf', mime: 'application/pdf', base64: 'AA==' }];
        expect(DIGITAL_DOWNLOAD_DESCRIPTOR.buildPayload({ files })).toEqual({ files });
    });

    it('round-trips the example for JSON-authored kinds', () => {
        const theme = ARTIFACT_FORM_REGISTRY.theme;
        expect(theme.supportsGuided).toBe(false);
        expect(theme.buildPayload(theme.defaults)).toEqual(theme.example);
    });

    it('toStringArray splits strings and preserves arrays', () => {
        expect(toStringArray('a, b  c')).toEqual(['a', 'b', 'c']);
        expect(toStringArray(['x', 'y'])).toEqual(['x', 'y']);
        expect(toStringArray(undefined)).toEqual([]);
    });

    it('parseJsonField parses JSON and defaults empty to {}', () => {
        expect(parseJsonField('')).toEqual({});
        expect(parseJsonField('{"a":1}')).toEqual({ a: 1 });
        expect(() => parseJsonField('{not json')).toThrow();
    });

    it('resolves templates by kind and preset id', () => {
        expect(getSellTemplate('theme')).toBe(ARTIFACT_FORM_REGISTRY.theme);
        expect(getSellTemplate(DIGITAL_DOWNLOAD_DESCRIPTOR.id)).toBe(DIGITAL_DOWNLOAD_DESCRIPTOR);
        expect(getSellTemplate('nope')).toBeUndefined();
    });
});
