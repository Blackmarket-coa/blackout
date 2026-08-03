/**
 * Per-artifact-kind form registry — the single source of truth for how a seller
 * authors each kind of "blackout product" (a feature-granting artifact) in the
 * guided sell flow. Every surface that drafts a listing (the SellProductWizard,
 * and optionally the raw-JSON Creator Studio) reads its field set, help text,
 * worked example, and payload assembler from here so they cannot drift.
 *
 * Grounding:
 * - The payload shapes come from the JSDoc contract on `CreatorListingDraft.
 *   artifactPayload` (`packages/core/src/marketplace/creator.ts`) and the tested
 *   seed payloads in `freeblackmarketStub.ts` (`SEEDED_LISTINGS`).
 * - The `select` option sets are imported from `@blackout/core` (the same
 *   `cosmeticTypes` / `soundKinds` / `streamAssetTypes` / `vaultKinds` /
 *   `privacyTiers` arrays that `validateArtifactPayload` enforces server-side),
 *   so a guided form can never build a payload the server would 400.
 * - `category` / `entitlementKind` are derived from `creatorArtifactMap.ts`, the
 *   same mapping the server validates against.
 *
 * Honest boundary: for the real Free Black Market provider the create call is
 * metadata-only — `artifactPayload` is dropped and the sellable bytes ship via
 * FBM's signed-bundle path. Authored payloads are fully exercised only against
 * the local stub (`FREEBLACKMARKET_STUB=1`); for production FBM they are a
 * draft/spec. See `docs/guides/marketplace-architecture.md`.
 */
import {
    cosmeticTypes,
    soundKinds,
    streamAssetTypes,
    vaultKinds,
    privacyTiers,
} from '@blackout/core';
import type {
    CreatorArtifactKind,
    CreatorEntitlementKind,
    CreatorListingCategory,
} from '../creatorClient';
import {
    categoryForArtifact,
    entitlementForArtifact,
    CREATOR_ARTIFACT_LABELS,
} from '../creatorArtifactMap';

export type ArtifactFieldControl =
    | 'text'
    | 'textarea'
    | 'number'
    | 'select'
    | 'tags'
    | 'json'
    | 'file-list';

export interface ArtifactField {
    /** Flat value key. `buildPayload` maps these onto the (possibly nested) shape. */
    key: string;
    label: string;
    help: string;
    control: ArtifactFieldControl;
    /** Allowed values for `select`, sourced from the core discriminant enums. */
    options?: readonly string[];
    required?: boolean;
    placeholder?: string;
}

/** An uploaded/attached artifact file, base64-encoded inline. */
export interface ArtifactFile {
    name: string;
    mime: string;
    base64: string;
}

export type ArtifactAudience = 'blackout-feature' | 'digital-download';

export interface ArtifactFormDescriptor {
    /** Stable id for the sell tile (usually the artifact kind, or a preset id). */
    id: string;
    kind: CreatorArtifactKind;
    label: string;
    summary: string;
    audience: ArtifactAudience;
    category: CreatorListingCategory;
    entitlementKind: CreatorEntitlementKind;
    /** Heading anchor in `docs/guides/creating-blackout-products.md`. */
    docAnchor: string;
    /**
     * True when the payload is small/structured enough for real per-field inputs.
     * False for large/free-form kinds (theme bundles, plugin code, templates),
     * which fall back to a prefilled JSON editor — an honest escape hatch rather
     * than a fake form.
     */
    supportsGuided: boolean;
    fields: ArtifactField[];
    /** Initial field values, so the form opens on a working example. */
    defaults: Record<string, unknown>;
    /** Worked example payload (from the stub seeds); shown in the UI and docs. */
    example: unknown;
    /** Assemble the real `artifactPayload` shape from flat field values. */
    buildPayload: (values: Record<string, unknown>) => unknown;
    /** Optional extra caveat surfaced in the form (e.g. AI-den-only). */
    notes?: string;
}

function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

/** Coerce a `tags`-control value (string[] or comma/space string) to string[]. */
export function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
    if (typeof value === 'string') {
        return value
            .split(/[\s,]+/)
            .map((s) => s.trim())
            .filter(Boolean);
    }
    return [];
}

/** Parse a `json`-control value; throws on invalid JSON so the caller can report it. */
export function parseJsonField(value: unknown): unknown {
    const raw = str(value).trim();
    if (!raw) return {};
    return JSON.parse(raw);
}

/** Builds a JSON-editor descriptor for kinds whose payload is large/free-form. */
function jsonDescriptor(args: {
    kind: CreatorArtifactKind;
    summary: string;
    docAnchor: string;
    example: unknown;
    help: string;
    notes?: string;
}): ArtifactFormDescriptor {
    const exampleText = JSON.stringify(args.example, null, 2);
    return {
        id: args.kind,
        kind: args.kind,
        label: CREATOR_ARTIFACT_LABELS[args.kind],
        summary: args.summary,
        audience: 'blackout-feature',
        category: categoryForArtifact(args.kind),
        entitlementKind: entitlementForArtifact(args.kind),
        docAnchor: args.docAnchor,
        supportsGuided: false,
        fields: [
            {
                key: 'json',
                label: 'Artifact payload (JSON)',
                help: args.help,
                control: 'json',
                required: true,
                placeholder: exampleText,
            },
        ],
        defaults: { json: exampleText },
        example: args.example,
        buildPayload: (values) => parseJsonField(values.json),
        notes: args.notes,
    };
}

function guidedDescriptor(d: {
    kind: CreatorArtifactKind;
    summary: string;
    docAnchor: string;
    fields: ArtifactField[];
    defaults: Record<string, unknown>;
    example: unknown;
    buildPayload: (values: Record<string, unknown>) => unknown;
    notes?: string;
}): ArtifactFormDescriptor {
    return {
        id: d.kind,
        kind: d.kind,
        label: CREATOR_ARTIFACT_LABELS[d.kind],
        summary: d.summary,
        audience: 'blackout-feature',
        category: categoryForArtifact(d.kind),
        entitlementKind: entitlementForArtifact(d.kind),
        docAnchor: d.docAnchor,
        supportsGuided: true,
        fields: d.fields,
        defaults: d.defaults,
        example: d.example,
        buildPayload: d.buildPayload,
        notes: d.notes,
    };
}

export const ARTIFACT_FORM_REGISTRY: Record<CreatorArtifactKind, ArtifactFormDescriptor> = {
    theme: jsonDescriptor({
        kind: 'theme',
        summary: 'Palette + design-token bundle. Reuses the customization bundle format.',
        docAnchor: '#theme',
        help: 'A serialized BlackoutCustomizationBundle (colors, tokens).',
        example: { palette: { background: '#0a0a0a', accent: '#9d8df1' } },
    }),
    manifest_plugin: jsonDescriptor({
        kind: 'manifest_plugin',
        summary: 'Declarative-only feature plugin. No JavaScript executes.',
        docAnchor: '#manifest_plugin',
        help: 'A FeatureCustomizationManifest object (no JS).',
        example: { id: 'stub.todo', name: 'Todo', category: 'workflow plugin' },
    }),
    code_plugin: jsonDescriptor({
        kind: 'code_plugin',
        summary: 'Sandboxed JavaScript bundle running in a worker boundary.',
        docAnchor: '#code_plugin',
        help: 'Object with { manifest, bundleBase64, sha256 } — runs in the sandbox.',
        example: { manifest: { id: 'stub.metascrub' }, bundleBase64: '', sha256: '' },
    }),
    community_template: jsonDescriptor({
        kind: 'community_template',
        summary: 'Den layout, role + permission bundle, or moderation rule pack.',
        docAnchor: '#community_template',
        help: 'Object with { template: { dens, roles, moderation, onboarding } }.',
        example: { template: { dens: ['lobby', 'study'], roles: ['mentor', 'student'] } },
    }),
    automation_recipe: jsonDescriptor({
        kind: 'automation_recipe',
        summary: 'Declarative trigger/action automation.',
        docAnchor: '#automation_recipe',
        help: 'Object with { triggers: [...], actions: [...] }.',
        example: {
            triggers: [{ type: 'member.joined' }],
            actions: [{ type: 'post_message', body: 'Welcome to the den!' }],
        },
    }),
    asset_bundle: guidedDescriptor({
        kind: 'asset_bundle',
        summary: 'Emoji, sticker, or meme assets exposed as an entitlement pack.',
        docAnchor: '#asset_bundle',
        fields: [
            {
                key: 'files',
                label: 'Files',
                help: 'The image/asset files in the pack. Delivered inline to the local stub; for live FBM the bytes ship via the signed bundle.',
                control: 'file-list',
                required: true,
            },
        ],
        defaults: { files: [] },
        example: { files: [{ name: 'cat.png', mime: 'image/png', base64: '' }] },
        buildPayload: (values) => ({ files: Array.isArray(values.files) ? values.files : [] }),
    }),
    profile_cosmetic: guidedDescriptor({
        kind: 'profile_cosmetic',
        summary: 'Avatar decoration, nameplate, profile effect, or collectible badge.',
        docAnchor: '#profile_cosmetic',
        fields: [
            {
                key: 'cosmeticType',
                label: 'Cosmetic type',
                help: 'Which profile surface this decorates.',
                control: 'select',
                options: cosmeticTypes,
                required: true,
            },
            {
                key: 'id',
                label: 'Cosmetic id',
                help: 'A stable id for this cosmetic (e.g. ring-aurora-01).',
                control: 'text',
                required: true,
                placeholder: 'ring-aurora-01',
            },
            {
                key: 'gradient',
                label: 'Gradient colors (optional)',
                help: 'Optional hex colors, comma-separated.',
                control: 'tags',
                placeholder: '#7af0ff, #9d8df1',
            },
        ],
        defaults: {
            cosmeticType: cosmeticTypes[0],
            id: 'ring-aurora-01',
            gradient: ['#7af0ff', '#9d8df1'],
        },
        example: {
            cosmeticType: 'avatar_decoration',
            id: 'ring-aurora-01',
            gradient: ['#7af0ff', '#9d8df1'],
        },
        buildPayload: (values) => {
            const gradient = toStringArray(values.gradient);
            return {
                cosmeticType: str(values.cosmeticType),
                id: str(values.id),
                ...(gradient.length > 0 ? { gradient } : {}),
            };
        },
    }),
    sound_pack: guidedDescriptor({
        kind: 'sound_pack',
        summary: 'Soundboard clips, notification sounds, or voice-filter presets.',
        docAnchor: '#sound_pack',
        fields: [
            {
                key: 'soundKind',
                label: 'Sound kind',
                help: 'How the sounds are used.',
                control: 'select',
                options: soundKinds,
                required: true,
            },
            {
                key: 'packId',
                label: 'Pack id',
                help: 'A stable id for the pack (e.g. airhorn-01).',
                control: 'text',
                required: true,
                placeholder: 'airhorn-01',
            },
            {
                key: 'clips',
                label: 'Clips (JSON, optional)',
                help: 'Optional array of { id, name } clip descriptors.',
                control: 'json',
                placeholder: '[{ "id": "airhorn", "name": "Airhorn" }]',
            },
        ],
        defaults: {
            soundKind: soundKinds[0],
            packId: 'airhorn-01',
            clips: '[{ "id": "airhorn", "name": "Airhorn" }]',
        },
        example: {
            soundKind: 'soundboard',
            packId: 'airhorn-01',
            clips: [{ id: 'airhorn', name: 'Airhorn' }],
        },
        buildPayload: (values) => {
            const clipsRaw = str(values.clips).trim();
            const clips = clipsRaw ? parseJsonField(clipsRaw) : undefined;
            return {
                soundKind: str(values.soundKind),
                packId: str(values.packId),
                ...(clips !== undefined ? { clips } : {}),
            };
        },
    }),
    stream_asset: guidedDescriptor({
        kind: 'stream_asset',
        summary: 'Overlay pack, alert pack, channel-point reward kit, or badge set.',
        docAnchor: '#stream_asset',
        fields: [
            {
                key: 'assetType',
                label: 'Asset type',
                help: 'What kind of stream asset this is.',
                control: 'select',
                options: streamAssetTypes,
                required: true,
            },
            {
                key: 'scenes',
                label: 'Scenes (optional)',
                help: 'Optional scene names, comma-separated (e.g. starting-soon, live).',
                control: 'tags',
                placeholder: 'starting-soon, live',
            },
        ],
        defaults: { assetType: streamAssetTypes[0], scenes: ['starting-soon', 'live'] },
        example: { assetType: 'overlay', scenes: ['starting-soon', 'live'] },
        buildPayload: (values) => {
            const scenes = toStringArray(values.scenes);
            return {
                assetType: str(values.assetType),
                ...(scenes.length > 0 ? { scenes } : {}),
            };
        },
    }),
    vault_item: guidedDescriptor({
        kind: 'vault_item',
        summary: 'Encrypted vault slot/template or privacy toolkit.',
        docAnchor: '#vault_item',
        fields: [
            {
                key: 'vaultKind',
                label: 'Vault kind',
                help: 'Whether the item is a vault slot or a template.',
                control: 'select',
                options: vaultKinds,
                required: true,
            },
        ],
        defaults: { vaultKind: vaultKinds[0] },
        example: { vaultKind: 'template' },
        buildPayload: (values) => ({ vaultKind: str(values.vaultKind) }),
        notes: 'To sell a plain downloadable file instead, use the "Digital download" template.',
    }),
    ai_persona: guidedDescriptor({
        kind: 'ai_persona',
        summary: 'AI persona or prompt pack, confined to AI dens.',
        docAnchor: '#ai_persona',
        fields: [
            {
                key: 'personaName',
                label: 'Persona name',
                help: 'Display name for the persona.',
                control: 'text',
                required: true,
                placeholder: 'Mentor',
            },
            {
                key: 'personaSystemPrompt',
                label: 'System prompt',
                help: 'The persona’s system prompt.',
                control: 'textarea',
                required: true,
                placeholder: 'You are a patient tutor.',
            },
        ],
        defaults: { personaName: 'Mentor', personaSystemPrompt: 'You are a patient tutor.' },
        example: { persona: { name: 'Mentor', systemPrompt: 'You are a patient tutor.' } },
        buildPayload: (values) => ({
            persona: {
                name: str(values.personaName),
                systemPrompt: str(values.personaSystemPrompt),
            },
        }),
        notes: 'AI personas can only be installed at den scope inside an AI den.',
    }),
    privacy_tool: guidedDescriptor({
        kind: 'privacy_tool',
        summary: 'Advanced privacy/security toolkit exposed as an entitlement.',
        docAnchor: '#privacy_tool',
        fields: [
            {
                key: 'tier',
                label: 'Tier',
                help: 'The privacy-tool tier.',
                control: 'select',
                options: privacyTiers,
                required: true,
            },
            {
                key: 'features',
                label: 'Features',
                help: 'Feature keys this tool unlocks, comma-separated (e.g. exif_strip, link_sanitize).',
                control: 'tags',
                required: true,
                placeholder: 'exif_strip, link_sanitize',
            },
        ],
        defaults: { tier: privacyTiers[0], features: ['exif_strip', 'link_sanitize'] },
        example: { tier: 'advanced', features: ['perturbation', 'exif_strip', 'link_sanitize'] },
        buildPayload: (values) => ({
            tier: str(values.tier),
            features: toStringArray(values.features),
        }),
    }),
};

/**
 * The "Digital download" preset — a `vault_item` carrying a `files` payload. This
 * is the in-repo path for a plain digital good (an ebook/PDF/zip): on purchase it
 * is delivered through the encrypted Matrix dead-drop (see
 * `packages/api/src/services/fbmMatrixBridge/deadDropDelivery.ts`). It is the
 * "non-blackout digital good" a Blackout seller can list without leaving the app;
 * the true FBM `digital` listing-type is documented in
 * `docs/guides/non-blackout-digital-goods.md`.
 */
export const DIGITAL_DOWNLOAD_DESCRIPTOR: ArtifactFormDescriptor = {
    id: 'digital_download',
    kind: 'vault_item',
    label: 'Digital download',
    summary: 'A plain file (PDF, zip, audio) delivered to the buyer after purchase.',
    audience: 'digital-download',
    category: categoryForArtifact('vault_item'),
    entitlementKind: entitlementForArtifact('vault_item'),
    docAnchor: '#digital-download',
    supportsGuided: true,
    fields: [
        {
            key: 'files',
            label: 'Files',
            help: 'The downloadable file(s) buyers receive. Delivered inline to the local stub; for live FBM the bytes ship via the signed bundle.',
            control: 'file-list',
            required: true,
        },
    ],
    defaults: { files: [] },
    example: { files: [{ name: 'guide.pdf', mime: 'application/pdf', base64: '' }] },
    buildPayload: (values) => ({ files: Array.isArray(values.files) ? values.files : [] }),
    notes: 'Sold as a vault_item; delivered via the encrypted dead-drop path.',
};

/** All sellable artifact kinds, in a stable display order (coalition_kit excluded). */
export const SELL_TEMPLATE_ORDER: CreatorArtifactKind[] = [
    'asset_bundle',
    'profile_cosmetic',
    'sound_pack',
    'stream_asset',
    'theme',
    'manifest_plugin',
    'code_plugin',
    'community_template',
    'ai_persona',
    'automation_recipe',
    'privacy_tool',
    'vault_item',
];

/**
 * Ordered list of sell templates for the wizard's chooser: the digital-download
 * preset first (the most common "just sell a file" case), then every artifact
 * kind. The wizard groups them by `audience`.
 */
export function listSellTemplates(): ArtifactFormDescriptor[] {
    return [
        DIGITAL_DOWNLOAD_DESCRIPTOR,
        ...SELL_TEMPLATE_ORDER.map((kind) => ARTIFACT_FORM_REGISTRY[kind]),
    ];
}

/** Look up a descriptor by its tile id (artifact kind or a preset id). */
export function getSellTemplate(id: string): ArtifactFormDescriptor | undefined {
    if (id === DIGITAL_DOWNLOAD_DESCRIPTOR.id) return DIGITAL_DOWNLOAD_DESCRIPTOR;
    return (ARTIFACT_FORM_REGISTRY as Record<string, ArtifactFormDescriptor>)[id];
}
