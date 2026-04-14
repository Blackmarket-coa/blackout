import { describe, expect, it } from "vitest";

import { renderMessageInput } from "../../src/components/MessageInput";

describe("renderMessageInput stego gating", () => {
  it("renders locked advanced codecs and inline upgrade action", () => {
    const html = renderMessageInput({
      disabled: false,
      canPropose: true,
      governanceEnabled: true,
      compactMode: false,
      richEditingEnabled: true,
      stegoEnabled: true,
      stegoAdvancedEnabled: false,
      composerRepliesEnabled: true,
      composerEditsEnabled: true,
      composerRedactionsEnabled: true,
      mediaCodeBlocksEnabled: true,
      mediaSpoilersEnabled: true,
      typingIndicatorsEnabled: true,
      showTypingIndicator: false,
      attachmentMode: "quick",
    });

    expect(html).toContain("Basic LSB (Image)");
    expect(html).toContain("DCT Image (Signal lock)");
    expect(html).toContain("Codec (Advanced)");
    expect(html).toContain('data-action="open-upgrade-flow"');
  });
});
