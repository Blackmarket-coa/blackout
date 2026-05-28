import { describe, expect, it } from 'vitest';
import { findBroker } from '@blackout/core';
import {
    buildMailto,
    formTarget,
} from '../../../../src/app/features/data-deletion/submissionLinks';
import { isIdentityComplete } from '../../../../src/app/features/data-deletion/dataDeletionAtoms';

const request = { subject: 'Data Deletion Request — Jane', body: 'Hello world & friends' };

describe('buildMailto', () => {
    it('builds a mailto with %20-encoded subject/body for email brokers', () => {
        const link = buildMailto(findBroker('oracle')!, request);
        expect(link).toMatch(/^mailto:privacy_us@oracle\.com\?/);
        expect(link).toContain('subject=Data%20Deletion%20Request');
        // space encoded as %20 (not +), ampersand encoded
        expect(link).toContain('body=Hello%20world%20%26%20friends');
        expect(link).not.toContain('+');
    });

    it('returns null for form brokers', () => {
        expect(buildMailto(findBroker('spokeo')!, request)).toBeNull();
    });
});

describe('formTarget', () => {
    it('returns the opt-out URL for form brokers and null for email brokers', () => {
        expect(formTarget(findBroker('spokeo')!)).toMatch(/^https:\/\//);
        expect(formTarget(findBroker('oracle')!)).toBeNull();
    });
});

describe('isIdentityComplete', () => {
    it('requires a name and a plausible email', () => {
        expect(isIdentityComplete({ fullName: '', email: '' })).toBe(false);
        expect(isIdentityComplete({ fullName: 'Jane', email: 'not-an-email' })).toBe(false);
        expect(isIdentityComplete({ fullName: 'Jane', email: 'jane@example.org' })).toBe(true);
    });
});
