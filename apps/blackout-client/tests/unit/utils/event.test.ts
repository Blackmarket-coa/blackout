import { describe, it } from 'vitest';

describe('event utils', () => {
  it.todo('getEventBody extracts plaintext body');
  it.todo('getEventFormattedBody extracts formatted_body html');
  it.todo('isRedacted detects redactions');
  it.todo('isEdited detects m.replace relation');
  it.todo('getEditedContent extracts m.new_content');
  it.todo('getReplyTo extracts m.in_reply_to event ID');
  it.todo('getThreadRoot extracts thread root event ID');
  it.todo('isNotificationEvent filters non-notify events');
});
