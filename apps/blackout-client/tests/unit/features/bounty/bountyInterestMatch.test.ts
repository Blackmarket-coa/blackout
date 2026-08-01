import { describe, expect, it } from 'vitest';
import { interestTagsToBountyCategories } from '../../../../src/app/features/bounty/bountyInterestMatch';

describe('interestTagsToBountyCategories', () => {
    it('maps obvious interest tags to their bounty category', () => {
        expect(interestTagsToBountyCategories(['streaming'])).toEqual(['creator']);
        expect(interestTagsToBountyCategories(['coding'])).toEqual(['developer']);
        expect(interestTagsToBountyCategories(['community'])).toEqual(['coalition']);
        expect(interestTagsToBountyCategories(['qa'])).toEqual(['tester']);
        expect(interestTagsToBountyCategories(['writing'])).toEqual(['content']);
    });

    it('normalizes case and a leading # before lookup', () => {
        expect(interestTagsToBountyCategories(['#Developer'])).toEqual(['developer']);
        expect(interestTagsToBountyCategories(['  STREAMING '])).toEqual(['creator']);
    });

    it('drops unmapped tags and de-duplicates categories', () => {
        expect(interestTagsToBountyCategories(['gardening', 'astrology', 'random-topic'])).toEqual(
            []
        );
        // Two tags collapse to one category; a third maps to another.
        const result = interestTagsToBountyCategories(['dev', 'programming', 'streaming']);
        expect(new Set(result)).toEqual(new Set(['developer', 'creator']));
        expect(result.length).toBe(2);
    });

    it('accepts a ReadonlySet (the shape useDiscoveryInterestTags returns)', () => {
        const tags: ReadonlySet<string> = new Set(['content', 'coalition']);
        expect(new Set(interestTagsToBountyCategories(tags))).toEqual(
            new Set(['content', 'coalition'])
        );
    });
});
