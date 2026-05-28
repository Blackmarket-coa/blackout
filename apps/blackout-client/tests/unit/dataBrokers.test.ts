import { describe, expect, it } from 'vitest';
import {
    DATA_BROKERS,
    findBroker,
    generateBrokerRequest,
    type RequesterIdentity,
} from '@blackout/core';

const identity: RequesterIdentity = {
    fullName: 'Jane Q. Public',
    email: 'jane@example.org',
    phone: '555-0100',
    addresses: ['123 Main St, Portland OR'],
};

describe('data broker registry', () => {
    it('has unique ids', () => {
        const ids = DATA_BROKERS.map((b) => b.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('every broker has a usable contact channel matching its method', () => {
        for (const b of DATA_BROKERS) {
            if (b.method === 'email') {
                expect(b.email, `${b.id} email`).toMatch(/.+@.+\..+/);
            } else {
                expect(b.optOutUrl, `${b.id} optOutUrl`).toMatch(/^https:\/\//);
            }
            expect(b.jurisdictions.length).toBeGreaterThan(0);
        }
    });

    it('findBroker resolves by id', () => {
        expect(findBroker('acxiom')?.name).toBe('Acxiom');
        expect(findBroker('nope')).toBeUndefined();
    });
});

describe('generateBrokerRequest', () => {
    it('cites GDPR Article 17 for deletion against an EU-reachable broker', () => {
        const broker = findBroker('oracle')!; // includes eu-gdpr
        const { subject, body } = generateBrokerRequest(broker, identity, 'deletion');
        expect(subject).toContain('Deletion');
        expect(subject).toContain(identity.fullName);
        expect(body).toContain('Article 17');
        expect(body).toContain('delete all personal information');
    });

    it('cites CCPA right-to-know for an access request against a US-only broker', () => {
        const broker = findBroker('spokeo')!; // us-ccpa only
        const { body } = generateBrokerRequest(broker, identity, 'access');
        expect(body).toContain('1798.110');
        expect(body).toContain('right to know');
    });

    it('restates the requester contact details and never emits undefined', () => {
        const { body } = generateBrokerRequest(findBroker('experian')!, identity, 'deletion');
        expect(body).toContain(identity.fullName);
        expect(body).toContain(identity.email);
        expect(body).toContain(identity.phone!);
        expect(body).toContain(identity.addresses![0]);
        expect(body).not.toContain('undefined');
    });

    it('omits optional lines when not provided', () => {
        const { body } = generateBrokerRequest(
            findBroker('experian')!,
            {
                fullName: 'A B',
                email: 'a@b.co',
            },
            'deletion'
        );
        expect(body).not.toContain('Phone:');
        expect(body).not.toContain('Address');
    });
});
