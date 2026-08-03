# Creating blackout products

A **blackout product** is a digital artifact that unlocks something _inside_
Blackout when purchased. This is the reference for the twelve sellable product
types: what each one is, the **payload** it needs, and a worked example. It backs
the per-type forms in the guided sell flow
([`selling-on-the-black-market.md`](selling-on-the-black-market.md)) — the form
help text and these shapes come from the same source
(`apps/blackout-client/src/app/features/creators/sell/artifactFormRegistry.ts`
and the contract in `packages/core/src/marketplace/creator.ts`).

## How authoring works

Every product carries three classifications, but you only choose the **type**
(the artifact kind); the other two are derived (`creatorArtifactMap.ts`):

-   **Artifact kind** — what the product _is_ (you choose this).
-   **Category** — which shelf it sits on (derived).
-   **Entitlement kind** — what buying it grants (derived).

The **payload** is the product's actual content. Its shape depends on the
artifact kind — that's what the rest of this page documents. In the guided flow,
small/structured payloads get a real form; large ones (theme bundles, plugin
code, templates) get a prefilled JSON editor.

> **The metadata-only boundary.** Against the local stub (`FREEBLACKMARKET_STUB=1`)
> the payload you author is stored and delivered. Against real Free Black Market,
> the create call sends **metadata only** — the sellable bytes are uploaded on the
> marketplace side. See
> [`marketplace-architecture.md`](marketplace-architecture.md#the-metadata-only-boundary).

## The `feature_keys` bridge

When a blackout product is purchased, the entitlement can carry `feature_keys` —
`features.*` identifiers that unlock the matching gated feature in the buyer's
app. This is what makes a purchase actually _do_ something in Blackout.

## At a glance

| Type (`artifactKind`)                       | Category             | Grants (`entitlementKind`) | Payload summary                       |
| ------------------------------------------- | -------------------- | -------------------------- | ------------------------------------- |
| [`asset_bundle`](#asset_bundle)             | `emoji-sticker`      | `asset_bundle`             | `{ files: [{ name, mime, base64 }] }` |
| [`profile_cosmetic`](#profile_cosmetic)     | `profile-cosmetic`   | `profile_cosmetic`         | `{ cosmeticType, id, … }`             |
| [`sound_pack`](#sound_pack)                 | `audio-pack`         | `sound_pack`               | `{ soundKind, packId, clips? }`       |
| [`stream_asset`](#stream_asset)             | `creator-asset`      | `stream_asset`             | `{ assetType, … }`                    |
| [`theme`](#theme)                           | `plugin-curated`     | `plugin_flag`              | serialized customization bundle       |
| [`manifest_plugin`](#manifest_plugin)       | `plugin-curated`     | `plugin_flag`              | a `FeatureCustomizationManifest`      |
| [`code_plugin`](#code_plugin)               | `plugin-curated`     | `software_license`         | `{ manifest, bundleBase64, sha256 }`  |
| [`community_template`](#community_template) | `community-template` | `community_template`       | `{ template: { … } }`                 |
| [`ai_persona`](#ai_persona)                 | `ai-automation`      | `plugin_flag`              | `{ persona: { name, systemPrompt } }` |
| [`automation_recipe`](#automation_recipe)   | `ai-automation`      | `plugin_flag`              | `{ triggers: [...], actions: [...] }` |
| [`privacy_tool`](#privacy_tool)             | `security-tool`      | `privacy_tool`             | `{ tier, features: [...] }`           |
| [`vault_item`](#vault_item)                 | `security-tool`      | `vault_item`               | `{ vaultKind }` or `{ files: [...] }` |

For a plain file with no in-app feature, see the
[Digital download](#digital-download) template and
[`non-blackout-digital-goods.md`](non-blackout-digital-goods.md).

---

## asset_bundle

Emoji, sticker, or meme assets exposed as an entitlement pack.

```json
{ "files": [{ "name": "cat.png", "mime": "image/png", "base64": "<bytes>" }] }
```

Attach the image files in the guided form. Grants an `asset_bundle` entitlement.

## profile_cosmetic

An avatar decoration, nameplate, profile effect, or collectible badge.

| Field          | Required | Values                                                         |
| -------------- | -------- | -------------------------------------------------------------- |
| `cosmeticType` | yes      | `avatar_decoration` · `nameplate` · `profile_effect` · `badge` |
| `id`           | yes      | a stable id, e.g. `ring-aurora-01`                             |
| `gradient`     | no       | list of hex colors                                             |

```json
{ "cosmeticType": "avatar_decoration", "id": "ring-aurora-01", "gradient": ["#7af0ff", "#9d8df1"] }
```

## sound_pack

Soundboard clips, notification sounds, or voice-filter presets.

| Field       | Required | Values                                         |
| ----------- | -------- | ---------------------------------------------- |
| `soundKind` | yes      | `soundboard` · `notification` · `voice_filter` |
| `packId`    | yes      | a stable id, e.g. `airhorn-01`                 |
| `clips`     | no       | array of `{ id, name }`                        |

```json
{
    "soundKind": "soundboard",
    "packId": "airhorn-01",
    "clips": [{ "id": "airhorn", "name": "Airhorn" }]
}
```

## stream_asset

An overlay pack, alert pack, channel-point reward kit, or badge set.

| Field       | Required | Values                                                  |
| ----------- | -------- | ------------------------------------------------------- |
| `assetType` | yes      | `overlay` · `alert` · `channel_point_kit` · `badge_set` |
| `scenes`    | no       | list of scene names                                     |

```json
{ "assetType": "overlay", "scenes": ["starting-soon", "live"] }
```

## theme

A palette + design-token bundle, in the same format as an in-app customization
bundle. Authored as JSON.

```json
{ "palette": { "background": "#0a0a0a", "accent": "#9d8df1" } }
```

Grants a `plugin_flag` entitlement.

## manifest_plugin

A **declarative-only** feature plugin — no JavaScript executes. The payload is a
`FeatureCustomizationManifest`. Authored as JSON.

```json
{ "id": "stub.todo", "name": "Todo", "category": "workflow plugin" }
```

## code_plugin

A sandboxed JavaScript bundle that runs inside a worker boundary. Grants a
`software_license`. Authored as JSON.

```json
{ "manifest": { "id": "stub.metascrub" }, "bundleBase64": "<bundle>", "sha256": "<hash>" }
```

## community_template

A den layout, role + permission bundle, or moderation rule pack. Authored as
JSON.

```json
{ "template": { "dens": ["lobby", "study"], "roles": ["mentor", "student"] } }
```

## ai_persona

An AI persona or prompt pack.

```json
{ "persona": { "name": "Mentor", "systemPrompt": "You are a patient tutor." } }
```

> **AI-den only.** AI personas can only be installed at den scope inside an AI
> den (`packages/core/src/marketplace/aiGate.ts`).

## automation_recipe

A declarative trigger/action automation. Authored as JSON.

```json
{
    "triggers": [{ "type": "member.joined" }],
    "actions": [{ "type": "post_message", "body": "Welcome to the den!" }]
}
```

## privacy_tool

An advanced privacy/security toolkit exposed as an entitlement.

| Field      | Required | Values                                                                            |
| ---------- | -------- | --------------------------------------------------------------------------------- |
| `tier`     | yes      | `advanced`                                                                        |
| `features` | yes      | feature keys the tool unlocks, e.g. `exif_strip`, `link_sanitize`, `perturbation` |

```json
{ "tier": "advanced", "features": ["perturbation", "exif_strip", "link_sanitize"] }
```

## vault_item

An encrypted vault slot/template, **or** a plain downloadable file.

| Field       | Required                  | Values              |
| ----------- | ------------------------- | ------------------- |
| `vaultKind` | for a vault slot/template | `slot` · `template` |

```json
{ "vaultKind": "template" }
```

To sell a plain file instead, use the [Digital download](#digital-download)
template, which is a `vault_item` carrying a `files` payload.

## Digital download

The in-app way to sell a **non-blackout digital good** (an ebook, PDF, zip). It's
a `vault_item` whose payload is your file(s); on purchase it's delivered through
the encrypted dead-drop path.

```json
{ "files": [{ "name": "guide.pdf", "mime": "application/pdf", "base64": "<bytes>" }] }
```

See [`non-blackout-digital-goods.md`](non-blackout-digital-goods.md) for the full
picture, including Free Black Market's own `digital` listing type.

---

## Not sold here: `coalition_kit`

There's a thirteenth artifact kind, `coalition_kit`, that is **rejected** by the
create endpoint (`packages/api/src/routes/creator.ts`). Coalition kit manifests
are published through the coalition-kit-manifests flow, not the marketplace — so
it does not appear as a sell template.
