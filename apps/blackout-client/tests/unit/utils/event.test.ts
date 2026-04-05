import { describe, expect, it, vi } from 'vitest';
import type { MatrixEvent } from 'matrix-js-sdk';
import {
  getEventBody,
  getEventFormattedBody,
  isRedacted,
  isEdited,
  getEditedContent,
  getReplyTo,
  getThreadRoot,
  isNotificationEvent,
} from '../../../src/app/utils/event';

const mockEvent = (overrides: {
  content?: Record<string, unknown>;
  isRedacted?: boolean;
  relation?: { rel_type: string; event_id?: string } | null;
  type?: string;
}): MatrixEvent =>
  ({
    getContent: () => overrides.content ?? {},
    isRedacted: () => overrides.isRedacted ?? false,
    getRelation: () => overrides.relation ?? null,
    getType: () => overrides.type ?? 'm.room.message',
  }) as unknown as MatrixEvent;

describe('event utils', () => {
  it('getEventBody extracts plaintext body', () => {
    expect(getEventBody(mockEvent({ content: { body: 'hello' } }))).toBe('hello');
  });

  it('getEventBody returns empty string when body is missing', () => {
    expect(getEventBody(mockEvent({ content: {} }))).toBe('');
  });

  it('getEventFormattedBody extracts formatted_body html', () => {
    expect(getEventFormattedBody(mockEvent({ content: { formatted_body: '<b>hi</b>' } }))).toBe('<b>hi</b>');
  });

  it('getEventFormattedBody returns null when formatted_body is missing', () => {
    expect(getEventFormattedBody(mockEvent({ content: {} }))).toBeNull();
  });

  it('isRedacted detects redactions', () => {
    expect(isRedacted(mockEvent({ isRedacted: true }))).toBe(true);
    expect(isRedacted(mockEvent({ isRedacted: false }))).toBe(false);
  });

  it('isEdited detects m.replace relation', () => {
    expect(isEdited(mockEvent({ relation: { rel_type: 'm.replace' } }))).toBe(true);
    expect(isEdited(mockEvent({ relation: { rel_type: 'm.annotation' } }))).toBe(false);
    expect(isEdited(mockEvent({}))).toBe(false);
  });

  it('getEditedContent extracts m.new_content', () => {
    const newContent = { body: 'edited' };
    expect(getEditedContent(mockEvent({ content: { 'm.new_content': newContent } }))).toEqual(newContent);
  });

  it('getEditedContent returns null when m.new_content is absent', () => {
    expect(getEditedContent(mockEvent({ content: {} }))).toBeNull();
    expect(getEditedContent(mockEvent({ content: { 'm.new_content': 'not-an-object' } }))).toBeNull();
  });

  it('getReplyTo extracts m.in_reply_to event ID', () => {
    const content = { 'm.relates_to': { 'm.in_reply_to': { event_id: '$abc' } } };
    expect(getReplyTo(mockEvent({ content }))).toBe('$abc');
  });

  it('getReplyTo returns null when no reply relation exists', () => {
    expect(getReplyTo(mockEvent({ content: {} }))).toBeNull();
  });

  it('getThreadRoot extracts thread root event ID', () => {
    const content = { 'm.relates_to': { rel_type: 'm.thread', event_id: '$root' } };
    expect(getThreadRoot(mockEvent({ content }))).toBe('$root');
  });

  it('getThreadRoot returns null for non-thread relations', () => {
    const content = { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$other' } };
    expect(getThreadRoot(mockEvent({ content }))).toBeNull();
    expect(getThreadRoot(mockEvent({ content: {} }))).toBeNull();
  });

  it('isNotificationEvent filters non-notify events', () => {
    expect(isNotificationEvent(mockEvent({ type: 'm.room.message' }))).toBe(true);
    expect(isNotificationEvent(mockEvent({ type: 'm.room.encrypted' }))).toBe(true);
    expect(isNotificationEvent(mockEvent({ type: 'm.sticker' }))).toBe(true);
    expect(isNotificationEvent(mockEvent({ type: 'm.room.member' }))).toBe(false);
  });

  it('isNotificationEvent returns false for redacted or edited events', () => {
    expect(isNotificationEvent(mockEvent({ type: 'm.room.message', isRedacted: true }))).toBe(false);
    expect(isNotificationEvent(mockEvent({ type: 'm.room.message', relation: { rel_type: 'm.replace' } }))).toBe(false);
  });
});
