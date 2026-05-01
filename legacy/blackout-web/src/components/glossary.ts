const GLOSSARY_DEFINITIONS = {
  "E2EE": "End-to-end encryption — only you and the recipient can read messages.",
  "Steganography": "Hiding a secret message inside normal-looking text or images.",
  "Stego Tier": "The level of steganographic encoding applied to a message.",
  "LSB (Image)": "Least Significant Bit — hides data in the smallest details of an image.",
  "DCT (Image)": "Discrete Cosine Transform — hides data in image frequency patterns.",
  "Federation": "Connecting multiple independent roots so they can communicate.",
  "Quorum": "The minimum number of votes needed for a decision to count.",
  "Reputation Tier": "Your trust level in the community (shadow → vendor → coordinator → arbiter).",
  "TTL": "Time To Live — how long an ephemeral message exists before auto-deleting.",
  "Ephemeral": "A message that automatically disappears after a set time.",
  "Codec": "The encoding method used to hide or reveal a steganographic message.",
  "Cover text": "The normal-looking text that carries a hidden message inside it.",
} as const;

export type GlossaryTerm = keyof typeof GLOSSARY_DEFINITIONS;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function glossaryDefinition(term: GlossaryTerm): string {
  return GLOSSARY_DEFINITIONS[term];
}

export function renderInfoTip(term: string, definition: string): string {
  const safeTerm = escapeHtml(term);
  const safeDefinition = escapeHtml(definition);
  return `<span class="info-tip"><button type="button" class="info-tip__trigger" aria-label="Explain ${safeTerm}" title="What does ${safeTerm} mean?">ⓘ</button><span class="info-tip__popover" role="note"><strong>${safeTerm}:</strong> ${safeDefinition}</span></span>`;
}

export function renderGlossaryTip(term: GlossaryTerm): string {
  return renderInfoTip(term, glossaryDefinition(term));
}
