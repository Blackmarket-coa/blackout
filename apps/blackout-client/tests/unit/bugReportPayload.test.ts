import { describe, expect, it } from 'vitest';
import {
  buildBugReportPayload,
  emptyDraft,
  isPayloadSubmittable,
} from '../../src/app/features/settings/bugReportState';

const baseDiagnostics = {
  clientVersion: '1.2.3',
  userAgent: 'TestAgent/1.0',
  platform: 'TestOS',
  consoleTail: ['2026-05-13T00:00:00Z [info] hello'],
};

describe('buildBugReportPayload', () => {
  it('trims title + description and copies category/severity verbatim', () => {
    const draft = {
      ...emptyDraft(),
      title: '  voice cuts out   ',
      description: '   When I join voice, the mic stops working ',
      category: 'voice' as const,
      severity: 'high' as const,
    };
    const out = buildBugReportPayload({ draft });
    expect(out.title).toBe('voice cuts out');
    expect(out.description).toBe('When I join voice, the mic stops working');
    expect(out.category).toBe('voice');
    expect(out.severity).toBe('high');
  });

  it('omits matrixId when includeMatrixIdHash is false even if an ID is provided', () => {
    const draft = { ...emptyDraft(), title: 'hello world', description: 'something is broken' };
    const out = buildBugReportPayload({ draft, matrixId: '@alice:example.org' });
    expect(out).not.toHaveProperty('matrixId');
  });

  it('includes matrixId only when the toggle is on and a value is provided', () => {
    const draft = {
      ...emptyDraft(),
      title: 'hello world',
      description: 'something is broken',
      includeMatrixIdHash: true,
    };
    const out = buildBugReportPayload({ draft, matrixId: '@alice:example.org' });
    expect(out.matrixId).toBe('@alice:example.org');
  });

  it('omits diagnostics when the toggle is off, even if data is collected', () => {
    const draft = {
      ...emptyDraft(),
      title: 'hello world',
      description: 'something is broken',
    };
    const out = buildBugReportPayload({ draft, diagnostics: baseDiagnostics });
    expect(out).not.toHaveProperty('diagnostics');
  });

  it('includes diagnostics when the toggle is on', () => {
    const draft = {
      ...emptyDraft(),
      title: 'hello world',
      description: 'something is broken',
      includeDiagnostics: true,
    };
    const out = buildBugReportPayload({ draft, diagnostics: baseDiagnostics });
    expect(out.diagnostics).toEqual(baseDiagnostics);
  });
});

describe('isPayloadSubmittable', () => {
  const valid = buildBugReportPayload({
    draft: {
      ...emptyDraft(),
      title: 'voice cuts out',
      description: 'When I join voice, the mic stops working',
    },
  });

  it('accepts a payload that satisfies length bounds', () => {
    expect(isPayloadSubmittable(valid)).toBe(true);
  });

  it('rejects a too-short title', () => {
    expect(isPayloadSubmittable({ ...valid, title: 'no' })).toBe(false);
  });

  it('rejects a too-short description', () => {
    expect(isPayloadSubmittable({ ...valid, description: 'too short' })).toBe(false);
  });

  it('rejects a too-long title', () => {
    expect(isPayloadSubmittable({ ...valid, title: 'x'.repeat(141) })).toBe(false);
  });
});
