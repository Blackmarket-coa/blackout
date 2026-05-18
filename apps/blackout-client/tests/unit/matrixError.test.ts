import { describe, expect, it } from 'vitest';
import { MatrixError } from 'matrix-js-sdk';
import { formatMatrixError } from '../../src/app/utils/matrixError';

const makeMatrixError = (errcode: string | undefined, data: object = {}): MatrixError =>
  new MatrixError({ errcode, ...data });

describe('formatMatrixError', () => {
  it('maps known Matrix errcodes to friendly copy', () => {
    expect(formatMatrixError(makeMatrixError('M_FORBIDDEN'), 'fallback')).toBe(
      "You don't have permission to do that.",
    );
    expect(formatMatrixError(makeMatrixError('M_LIMIT_EXCEEDED'), 'fallback')).toContain(
      'Too many requests',
    );
    expect(formatMatrixError(makeMatrixError('M_UNKNOWN_TOKEN'), 'fallback')).toContain(
      'session has expired',
    );
    expect(formatMatrixError(makeMatrixError('M_MISSING_TOKEN'), 'fallback')).toContain(
      'session has expired',
    );
    expect(formatMatrixError(makeMatrixError('M_NOT_FOUND'), 'fallback')).toContain(
      "doesn't exist",
    );
    expect(formatMatrixError(makeMatrixError('M_USER_DEACTIVATED'), 'fallback')).toContain(
      'deactivated',
    );
  });

  it('falls back to the server-provided error string for unknown errcodes', () => {
    const err = makeMatrixError('M_SOMETHING_NEW', { error: 'Server says no' });
    expect(formatMatrixError(err, 'fallback')).toBe('Server says no');
  });

  it('uses the caller fallback when no server message is available', () => {
    const err = makeMatrixError('M_SOMETHING_NEW');
    expect(formatMatrixError(err, 'caller fallback')).toBe('caller fallback');
  });

  it('detects network TypeErrors', () => {
    expect(formatMatrixError(new TypeError('Failed to fetch'), 'fallback')).toContain(
      'Network error',
    );
    expect(
      formatMatrixError(
        new TypeError('NetworkError when attempting to fetch resource.'),
        'fallback',
      ),
    ).toContain('Network error');
  });

  it('returns the fallback for plain Errors and unknown values', () => {
    expect(formatMatrixError(new Error('weird'), 'fallback copy')).toBe('fallback copy');
    expect(formatMatrixError('string error', 'fallback copy')).toBe('fallback copy');
    expect(formatMatrixError(undefined, 'fallback copy')).toBe('fallback copy');
  });
});
