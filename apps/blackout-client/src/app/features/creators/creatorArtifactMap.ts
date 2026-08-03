import type {
    CreatorArtifactKind,
    CreatorEntitlementKind,
    CreatorListingCategory,
} from './creatorClient';

/**
 * Canonical artifact-kind → marketplace category / entitlement mapping.
 *
 * Shared by every surface that drafts a creator listing (the developer
 * Creator Studio and the in-hub listing composer) so the two cannot drift
 * out of sync and produce divergent category/entitlement pairs for the same
 * artifact kind. The server (`packages/api/src/routes/creator.ts`) validates
 * both fields against fixed enums, so the return types are the strict unions.
 */
export function categoryForArtifact(kind: CreatorArtifactKind): CreatorListingCategory {
    switch (kind) {
        case 'theme':
        case 'manifest_plugin':
        case 'code_plugin':
            return 'plugin-curated';
        case 'asset_bundle':
            return 'emoji-sticker';
        case 'profile_cosmetic':
            return 'profile-cosmetic';
        case 'sound_pack':
            return 'audio-pack';
        case 'community_template':
            return 'community-template';
        case 'stream_asset':
            return 'creator-asset';
        case 'vault_item':
            return 'security-tool';
        case 'ai_persona':
        case 'automation_recipe':
            return 'ai-automation';
        case 'privacy_tool':
            return 'security-tool';
    }
}

export function entitlementForArtifact(kind: CreatorArtifactKind): CreatorEntitlementKind {
    switch (kind) {
        case 'theme':
        case 'manifest_plugin':
            return 'plugin_flag';
        case 'code_plugin':
            return 'software_license';
        case 'asset_bundle':
            return 'asset_bundle';
        case 'profile_cosmetic':
            return 'profile_cosmetic';
        case 'sound_pack':
            return 'sound_pack';
        case 'community_template':
            return 'community_template';
        case 'stream_asset':
            return 'stream_asset';
        case 'vault_item':
            return 'vault_item';
        case 'ai_persona':
        case 'automation_recipe':
            return 'plugin_flag';
        case 'privacy_tool':
            return 'privacy_tool';
    }
}

/** Human-facing labels for the artifact kinds, for composer/select surfaces. */
export const CREATOR_ARTIFACT_LABELS: Record<CreatorArtifactKind, string> = {
    theme: 'Theme pack',
    manifest_plugin: 'Manifest plugin',
    code_plugin: 'Code plugin',
    asset_bundle: 'Asset bundle',
    profile_cosmetic: 'Profile cosmetic',
    sound_pack: 'Sound pack',
    community_template: 'Community template',
    stream_asset: 'Stream asset',
    vault_item: 'Security item',
    ai_persona: 'AI persona',
    automation_recipe: 'Automation recipe',
    privacy_tool: 'Privacy tool',
};

export const CREATOR_ARTIFACT_KINDS: CreatorArtifactKind[] = Object.keys(
    CREATOR_ARTIFACT_LABELS
) as CreatorArtifactKind[];
