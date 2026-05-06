import { describe, expect, it } from 'vitest';
import { formatCents } from '../../../../src/app/features/monetization/monetizationApi';

describe('formatCents', () => {
    it('renders USD with two decimals and no separators', () => {
        expect(formatCents(0)).toBe('$0.00');
        expect(formatCents(1)).toBe('$0.01');
        expect(formatCents(99)).toBe('$0.99');
        expect(formatCents(100)).toBe('$1.00');
        expect(formatCents(1234)).toBe('$12.34');
        expect(formatCents(100_000)).toBe('$1000.00');
    });

    it('falls back to numeric formatting with the currency code for non-USD', () => {
        expect(formatCents(1234, 'EUR')).toBe('12.34 EUR');
        expect(formatCents(50_000, 'JPY')).toBe('500.00 JPY');
    });

    it('handles cents with single-digit remainder by left-padding', () => {
        expect(formatCents(105)).toBe('$1.05');
        expect(formatCents(2007)).toBe('$20.07');
    });
});
