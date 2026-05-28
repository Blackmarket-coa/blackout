import { Hono } from 'hono';
import { z } from 'zod';
import {
    parseCreatorListingDraft,
    type CreatorListing,
    type MarketplaceProviderId,
} from '@blackout/core';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { getMarketplaceProvider, listEnabledProviders } from '../integrations/marketplace';
import {
    createCreatorListingRecord,
    deleteCreatorListing,
    getCreatorListing,
    listCreatorListingsForUser,
    updateCreatorListingStatus,
} from '../services/creatorListings';
import { incrementCounter, logEvent } from '../services/marketplaceObservability';

const creator = new Hono();

const draftSchema = z.object({
    providerId: z.string().min(1),
    artifactKind: z.enum([
        'theme',
        'manifest_plugin',
        'code_plugin',
        'asset_bundle',
        'coalition_kit',
        'profile_cosmetic',
        'sound_pack',
        'community_template',
        'stream_asset',
        'vault_item',
        'ai_persona',
        'automation_recipe',
        'privacy_tool',
    ]),
    category: z.enum([
        'emoji-sticker',
        'meme-asset',
        'stego-software',
        'plugin-curated',
        'subscription',
        'profile-cosmetic',
        'audio-pack',
        'community-template',
        'creator-asset',
        'security-tool',
        'ai-automation',
    ]),
    entitlementKind: z.enum([
        'emoji_pack',
        'asset_bundle',
        'software_license',
        'plugin_flag',
        'subscription_tier',
        'post_unlock',
        'event_ticket',
        'role_grant',
        'channel_access',
        'profile_cosmetic',
        'sound_pack',
        'community_template',
        'stream_asset',
        'vault_item',
        'privacy_tool',
    ]),
    title: z.string().min(1),
    description: z.string().min(1),
    priceCents: z.number().int().nonnegative(),
    currency: z.string().min(3).max(8),
    tags: z.array(z.string()).optional(),
    mediaUrls: z.array(z.string()).optional(),
    artifactPayload: z.unknown().optional(),
    artifactUploadId: z.string().optional(),
});

function pickProvider(providerId: string) {
    const provider = getMarketplaceProvider(providerId as MarketplaceProviderId);
    if (!provider || !provider.enabled) return null;
    return provider;
}

function toClientView(record: CreatorListing) {
    return {
        id: record.id,
        providerId: record.providerId,
        providerListingId: record.providerListingId,
        artifactKind: record.artifactKind,
        category: record.category,
        entitlementKind: record.entitlementKind,
        title: record.title,
        description: record.description,
        priceCents: record.priceCents,
        currency: record.currency,
        status: record.status,
        publicSlug: record.publicSlug,
        publishedAt: record.publishedAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

creator.get('/providers', (c) => {
    const providers = listEnabledProviders()
        .filter((p) => p.capabilities.includes('creator-write'))
        .map((p) => ({
            id: p.id,
            displayName: p.displayName,
            capabilities: p.capabilities,
        }));
    return c.json({ providers });
});

creator.get('/listings/mine', (c) => {
    const user = requireUser(c, 'Sign in to view your creator listings');
    if (user instanceof Response) return user;
    const records = listCreatorListingsForUser(user.sub).map(toClientView);
    return c.json({ listings: records });
});

creator.post('/listings', async (c) => {
    const user = requireUser(c, 'Sign in to publish listings');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, draftSchema);
    if (parsed instanceof Response) return parsed;
    const provider = pickProvider(parsed.providerId);
    if (!provider) {
        return c.json({ code: 'provider_unavailable', message: 'Provider not available' }, 404);
    }
    if (!provider.createCreatorListing) {
        return c.json(
            { code: 'creator_unsupported', message: 'Provider does not support creator publishing' },
            400
        );
    }

    const draft = parseCreatorListingDraft(parsed);

    // Coalition kit manifests are applied via the coalition-kit-manifests flow,
    // not sold through external marketplace providers. Rejecting here also
    // narrows draft.artifactKind to the provider-sellable kinds below.
    if (draft.artifactKind === 'coalition_kit') {
        return c.json(
            {
                code: 'unsupported_artifact',
                message:
                    'Coalition kit manifests are published via the coalition-kit-manifests flow, not marketplace providers.',
            },
            400
        );
    }

    let providerResult;
    try {
        providerResult = await provider.createCreatorListing({
            sellerUserId: user.sub,
            artifactKind: draft.artifactKind,
            category: draft.category,
            entitlementKind: draft.entitlementKind,
            title: draft.title,
            description: draft.description,
            priceCents: draft.priceCents,
            currency: draft.currency,
            tags: draft.tags,
            mediaUrls: draft.mediaUrls,
            artifactPayload: draft.artifactPayload,
            artifactUploadId: draft.artifactUploadId,
        });
    } catch (error) {
        logEvent('creator.listing.upstream_failed', {
            providerId: provider.id,
            sellerUserId: user.sub,
            error: error instanceof Error ? error.message : String(error),
        });
        incrementCounter('creator_listing_upstream_failed_total', { providerId: provider.id });
        return c.json(
            { code: 'upstream_failed', message: 'Provider rejected the listing' },
            502
        );
    }

    const record = createCreatorListingRecord({
        sellerUserId: user.sub,
        providerId: provider.id,
        draft,
        providerListingId: providerResult.providerListingId,
        publicSlug: providerResult.publicSlug,
        status: providerResult.status,
    });

    incrementCounter('creator_listing_created_total', {
        providerId: provider.id,
        artifactKind: draft.artifactKind,
    });

    return c.json({ listing: toClientView(record) }, 201);
});

creator.post('/listings/:id/publish', async (c) => {
    const user = requireUser(c, 'Sign in to publish listings');
    if (user instanceof Response) return user;
    const record = getCreatorListing(c.req.param('id'));
    if (!record || record.sellerUserId !== user.sub) {
        return c.json({ code: 'listing_not_found', message: 'No such listing' }, 404);
    }
    const provider = pickProvider(record.providerId);
    if (!provider?.publishCreatorListing) {
        return c.json(
            { code: 'creator_unsupported', message: 'Provider cannot publish' },
            400
        );
    }
    if (!record.providerListingId) {
        return c.json(
            { code: 'listing_not_uploaded', message: 'Listing missing providerListingId' },
            400
        );
    }
    try {
        const result = await provider.publishCreatorListing(record.providerListingId);
        const updated = updateCreatorListingStatus(record.id, {
            status: result.status,
            publicSlug: result.publicSlug,
        });
        return c.json({ listing: updated ? toClientView(updated) : null });
    } catch (error) {
        logEvent('creator.listing.publish_failed', {
            id: record.id,
            providerId: provider.id,
            error: error instanceof Error ? error.message : String(error),
        });
        return c.json({ code: 'upstream_failed', message: 'Publish rejected' }, 502);
    }
});

creator.delete('/listings/:id', async (c) => {
    const user = requireUser(c, 'Sign in to manage listings');
    if (user instanceof Response) return user;
    const record = getCreatorListing(c.req.param('id'));
    if (!record || record.sellerUserId !== user.sub) {
        return c.json({ code: 'listing_not_found', message: 'No such listing' }, 404);
    }
    const provider = pickProvider(record.providerId);
    if (provider?.archiveCreatorListing && record.providerListingId) {
        try {
            await provider.archiveCreatorListing(record.providerListingId);
        } catch (error) {
            logEvent('creator.listing.archive_failed', {
                id: record.id,
                providerId: provider.id,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    deleteCreatorListing(record.id);
    return c.json({ ok: true });
});

const onboardingSchema = z.object({
    providerId: z.string().min(1),
    returnUrl: z.string().optional(),
});

creator.post('/payouts/onboarding', async (c) => {
    const user = requireUser(c, 'Sign in to start payout onboarding');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, onboardingSchema);
    if (parsed instanceof Response) return parsed;
    const provider = pickProvider(parsed.providerId);
    if (!provider?.startCreatorOnboarding) {
        return c.json(
            { code: 'creator_unsupported', message: 'Provider does not support payouts' },
            400
        );
    }
    try {
        const handle = await provider.startCreatorOnboarding(user.sub, parsed.returnUrl);
        return c.json(handle);
    } catch (error) {
        logEvent('creator.onboarding.failed', {
            providerId: provider.id,
            sellerUserId: user.sub,
            error: error instanceof Error ? error.message : String(error),
        });
        return c.json({ code: 'upstream_failed', message: 'Onboarding rejected' }, 502);
    }
});

export default creator;
