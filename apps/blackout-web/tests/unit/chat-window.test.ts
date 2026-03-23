import { describe, expect, it } from "vitest";

import { renderChatWindow } from "../../src/components/ChatWindow";

describe("renderChatWindow", () => {
  it("renders right-panel trigger actions for plan-aligned contextual overlays", () => {
    const html = renderChatWindow({
      channelLabel: "governance",
      messages: [],
      canSend: true,
      sendPending: false,
      richEditingEnabled: true,
      stegoEnabled: true,
      composerRepliesEnabled: true,
      composerEditsEnabled: true,
      composerRedactionsEnabled: true,
      mediaCodeBlocksEnabled: true,
      mediaSpoilersEnabled: true,
      typingIndicatorsEnabled: true,
      showTypingIndicator: false,
      compactMode: false,
      compactRecommended: false,
    });

    expect(html).toContain('data-action="open-right-panel" data-panel="members"');
    expect(html).toContain('data-action="open-right-panel" data-panel="threads"');
    expect(html).toContain('data-action="open-right-panel" data-panel="pinned"');
    expect(html).toContain('data-action="open-right-panel" data-panel="search"');
    expect(html).toContain('data-action="open-right-panel" data-panel="governance"');
  });
});
