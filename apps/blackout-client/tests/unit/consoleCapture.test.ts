import { describe, expect, it, beforeEach } from 'vitest';
import {
  __test__,
  getConsoleTail,
} from '../../src/app/lib/diagnostics/consoleCapture';

describe('consoleCapture', () => {
  beforeEach(() => {
    __test__.reset();
  });

  it('returns an empty tail before any line is captured', () => {
    expect(getConsoleTail()).toEqual([]);
  });

  it('keeps only the last N lines (default 50)', () => {
    for (let i = 0; i < 60; i += 1) {
      __test__.pushForTest('info', [`line ${i}`]);
    }
    const tail = getConsoleTail();
    expect(tail).toHaveLength(50);
    expect(tail[0]).toMatch(/line 10/);
    expect(tail[49]).toMatch(/line 59/);
  });

  it('stringifies objects and errors without throwing', () => {
    __test__.pushForTest('error', [new Error('boom')]);
    __test__.pushForTest('warn', [{ a: 1 }]);
    const tail = getConsoleTail();
    expect(tail[0]).toMatch(/Error: boom/);
    expect(tail[1]).toMatch(/"a":1/);
  });
});
