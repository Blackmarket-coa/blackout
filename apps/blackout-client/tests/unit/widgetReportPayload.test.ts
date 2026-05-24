import { describe, expect, it } from 'vitest';
import {
  buildWidgetPayload,
  emptyWidgetDraft,
  isWidgetDraftSubmittable,
  type WidgetReportMetadata,
} from '../../src/app/features/bug-widget/widgetReportState';

const meta: WidgetReportMetadata = {
  clientVersion: '4.10.5',
  userAgent: 'TestAgent/1.0',
  platform: 'TestOS',
  screenWidth: 1280,
  screenHeight: 720,
  currentPath: '/communities/abc/dens/xyz',
  currentRoomId: 'xyz',
  buildChannel: 'test',
};

describe('buildWidgetPayload', () => {
  it('trims description and includes optional steps/suggestions only when non-empty', () => {
    const draft = { description: '  thing is broken here  ', steps: '  do x  ', suggestions: '   ' };
    const out = buildWidgetPayload({ draft, metadata: meta });
    expect(out.description).toBe('thing is broken here');
    expect(out.steps).toBe('do x');
    expect(out).not.toHaveProperty('suggestions');
    expect(out.metadata).toBe(meta);
  });

  it('omits reporter id unless opted in with a value', () => {
    const draft = { ...emptyWidgetDraft(), description: 'something is broken' };
    expect(buildWidgetPayload({ draft, metadata: meta })).not.toHaveProperty('reporterMatrixId');
    expect(
      buildWidgetPayload({ draft, metadata: meta, matrixId: '@a:b.org', includeReporterHash: false }),
    ).not.toHaveProperty('reporterMatrixId');
    const opted = buildWidgetPayload({
      draft,
      metadata: meta,
      matrixId: '@a:b.org',
      includeReporterHash: true,
    });
    expect(opted.reporterMatrixId).toBe('@a:b.org');
    expect(opted.includeReporterHash).toBe(true);
  });

  it('passes an attachment through when present', () => {
    const draft = { ...emptyWidgetDraft(), description: 'broken with a shot' };
    const attachment = { filename: 's.png', contentType: 'image/png', base64: 'AAAA' };
    expect(buildWidgetPayload({ draft, metadata: meta, attachment }).attachment).toEqual(attachment);
  });
});

describe('isWidgetDraftSubmittable', () => {
  it('requires at least 10 description characters', () => {
    expect(isWidgetDraftSubmittable({ ...emptyWidgetDraft(), description: 'too short' })).toBe(false);
    expect(isWidgetDraftSubmittable({ ...emptyWidgetDraft(), description: 'this is long enough' })).toBe(
      true,
    );
  });
});
