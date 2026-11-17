import type { PluginPublishingKey } from './pluginSignature';

/**
 * The plugin publishing keys every build of this app trusts: the public halves
 * of the Ed25519 keys Free Black Market signs marketplace bundles with. A
 * bundle installs only if its signature checks out against one of these (or
 * one named in `VITE_PLUGIN_PUBLISHING_KEYS` when the app was built); while
 * this list is empty, a production build installs no plugin at all.
 *
 * To add one, on the server that holds the private key:
 *
 *   node tools/plugins/publishing-key.mjs public --key <private-key.pem> --key-id <id>
 *
 * prints the line to paste below (`generate` makes a new key pair). The private
 * key goes to Free Black Market's publishing setting and nowhere else; see
 * `docs/security/map-tiles-and-plugin-key-2026-11-17.md`, P.
 *
 * To rotate, add the new key, ship a build with both, switch Free Black Market
 * to the new one, and remove the old entry once no build in use needs it. A
 * key that leaks is removed at once: builds still pinning it will install
 * whatever it signs.
 */
export const PINNED_PUBLISHING_KEYS: readonly PluginPublishingKey[] = [];
