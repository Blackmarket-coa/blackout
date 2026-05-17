import { describe, expect, it } from 'vitest';
import { redactObject, redactString } from '@blackout/core/redaction';

describe('@blackout/core/redaction in the browser', () => {
  it('scrubs JWT-shaped strings via key path or inline', () => {
    const head = 'ey' + 'J' + 'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const body = 'ey' + 'J' + 'zdWIiOiIxMjM0NTY3ODkwIn0';
    const sig = 'aaaaaaaaaaaaaaaaaaaa';
    const jwt = `${head}.${body}.${sig}`;
    expect(redactString(`token=${jwt}`)).toMatch(/\[REDACTED\]/);
    expect(redactObject({ access_token: 'xyz', message: 'ok' })).toEqual({
      access_token: '[REDACTED]',
      message: 'ok',
    });
  });

  it('pseudonymize: true hashes matrix IDs and room IDs inline', () => {
    const hash = (v: string) => `hashed(${v.length})`;
    const out = redactObject(
      { description: 'in !abc:server with @alice:server crashed' },
      { pseudonymize: true, hash },
    );
    expect((out as { description: string }).description).not.toMatch(/!abc:server/);
    expect((out as { description: string }).description).not.toMatch(/@alice:server/);
  });

  it('PII keys pseudonymize when opted in, preserve in dev', () => {
    const hash = (v: string) => `H${v.length}`;
    const opted = redactObject({ email: 'a@b.com' }, { pseudonymize: true, hash });
    expect((opted as { email: string }).email).toBe('H7');
    const plain = redactObject({ email: 'a@b.com' });
    expect((plain as { email: string }).email).toBe('a@b.com');
  });
});
