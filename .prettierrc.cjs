// Self-contained Prettier config for the modern monorepo (packages/*, root).
// Mirrors apps/blackout-client/.prettierrc.json; tabWidth (4) comes from
// .editorconfig, which the Prettier CLI reads. Previously this re-exported
// eslint-plugin-matrix-org's config (an upstream Element/Cinny dev dep that was
// never installed here), which broke every `prettier` invocation.
module.exports = { printWidth: 100, singleQuote: true };
