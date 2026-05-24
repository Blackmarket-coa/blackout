import { describe, expect, it } from 'vitest';
import {
    appendToast,
    buildToast,
    removeToast,
    DEFAULT_TOAST_DURATION_MS,
    type ToastItem,
} from '../../src/app/state/notifications/toast';

describe('toast reducer helpers', () => {
    it('buildToast applies defaults (Primary variant, default duration)', () => {
        const t = buildToast('hello', { id: 'fixed-1' });
        expect(t).toEqual({
            id: 'fixed-1',
            message: 'hello',
            variant: 'Primary',
            durationMs: DEFAULT_TOAST_DURATION_MS,
        });
    });

    it('buildToast honors explicit variant + duration', () => {
        const t = buildToast('boom', { id: 'fixed-2', variant: 'Critical', durationMs: 1000 });
        expect(t.variant).toBe('Critical');
        expect(t.durationMs).toBe(1000);
    });

    it('buildToast generates unique ids when none supplied', () => {
        const a = buildToast('a');
        const b = buildToast('b');
        expect(a.id).not.toEqual(b.id);
    });

    it('appendToast adds to the end without mutating the input', () => {
        const start: ToastItem[] = [];
        const item = buildToast('x', { id: 'x1' });
        const next = appendToast(start, item);
        expect(next).toHaveLength(1);
        expect(next[0].id).toBe('x1');
        expect(start).toHaveLength(0); // immutable
    });

    it('removeToast drops the matching id and leaves others', () => {
        const queue = [
            buildToast('a', { id: 'a' }),
            buildToast('b', { id: 'b' }),
            buildToast('c', { id: 'c' }),
        ];
        const next = removeToast(queue, 'b');
        expect(next.map((t) => t.id)).toEqual(['a', 'c']);
    });

    it('removeToast is a no-op for an unknown id', () => {
        const queue = [buildToast('a', { id: 'a' })];
        expect(removeToast(queue, 'zzz')).toEqual(queue);
    });
});
