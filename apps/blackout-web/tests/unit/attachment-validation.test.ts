import { describe, expect, it } from "vitest";

import { parseAttachmentImport, validateAttachmentInput, validateAttachmentUrl } from "../../src/utils/attachment-validation";

describe("attachment validation utils", () => {
  it("validates URL protocol and format", () => {
    expect(validateAttachmentUrl("https://cdn.example.com/meme.gif").valid).toBe(true);
    expect(validateAttachmentUrl("ftp://cdn.example.com/meme.gif")).toEqual({
      valid: false,
      error: "URL must use http:// or https://.",
    });
    expect(validateAttachmentUrl("not-a-url").valid).toBe(false);
  });

  it("parses attachment imports and reports line-level errors", () => {
    const valid = parseAttachmentImport('[{ "type":"meme","label":"Ship it","url":"https://cdn.example.com/meme.gif" }]');
    expect(valid.error).toBeUndefined();
    expect(valid.parsedCount).toBe(1);

    const invalid = parseAttachmentImport('[{ "type":"meme",\n "label":"Ship it" ');
    expect(invalid.error).toContain("line 2");
    expect(invalid.parsedCount).toBe(0);
  });

  it("reuses shared schema for single attachment input", () => {
    expect(
      validateAttachmentInput({
        type: "video",
        label: "Demo clip",
        url: "https://cdn.example.com/demo.mp4",
      }).attachment,
    ).toEqual({
      type: "video",
      label: "Demo clip",
      url: "https://cdn.example.com/demo.mp4",
    });
    expect(validateAttachmentInput({ type: "video", label: "", url: "https://cdn.example.com/demo.mp4" }).inputError).toBe("Label is required.");
  });
});

