/**
 * Curated registry of consumer data brokers with their statutory opt-out /
 * deletion channels. All fields are PUBLIC information (published privacy-policy
 * contacts and opt-out pages) — there is no user data here. The client uses
 * this to help a user fire deletion / access requests; submission stays on the
 * user's side (mailto: or the broker's own form), so Blackout never sends or
 * stores anyone's PII.
 */

export type BrokerJurisdiction = 'us-ccpa' | 'eu-gdpr' | 'us-other';

export type BrokerMethod = 'email' | 'form';

export interface DataBroker {
    /** Stable slug used as the local status key. */
    id: string;
    name: string;
    /** Which statutory regimes this broker is reachable under (drives template wording). */
    jurisdictions: BrokerJurisdiction[];
    /** Preferred submission channel. */
    method: BrokerMethod;
    /** Privacy/opt-out email — required when method === 'email'. */
    email?: string;
    /** Opt-out / deletion request page — required when method === 'form'. */
    optOutUrl?: string;
    /** Privacy policy, for reference. */
    privacyPolicyUrl?: string;
    notes?: string;
}

/**
 * Starter set of well-known brokers. Public opt-out endpoints; intended to grow
 * over time. Form-based brokers (most consumer people-search sites only accept
 * their own form) carry an `optOutUrl`; the rest accept email.
 */
export const DATA_BROKERS: readonly DataBroker[] = [
    {
        id: 'acxiom',
        name: 'Acxiom',
        jurisdictions: ['us-ccpa', 'eu-gdpr'],
        method: 'form',
        optOutUrl: 'https://www.acxiom.com/optout/',
        privacyPolicyUrl: 'https://www.acxiom.com/privacy/',
    },
    {
        id: 'oracle',
        name: 'Oracle Data Cloud',
        jurisdictions: ['us-ccpa', 'eu-gdpr'],
        method: 'email',
        email: 'privacy_us@oracle.com',
        privacyPolicyUrl: 'https://www.oracle.com/legal/privacy/',
    },
    {
        id: 'epsilon',
        name: 'Epsilon',
        jurisdictions: ['us-ccpa'],
        method: 'email',
        email: 'privacy@epsilon.com',
        optOutUrl: 'https://www.epsilon.com/us/consumer-information',
    },
    {
        id: 'lexisnexis',
        name: 'LexisNexis Risk Solutions',
        jurisdictions: ['us-ccpa', 'us-other'],
        method: 'form',
        optOutUrl: 'https://optout.lexisnexis.com/',
        privacyPolicyUrl: 'https://risk.lexisnexis.com/privacy-policy',
    },
    {
        id: 'spokeo',
        name: 'Spokeo',
        jurisdictions: ['us-ccpa'],
        method: 'form',
        optOutUrl: 'https://www.spokeo.com/optout',
    },
    {
        id: 'whitepages',
        name: 'Whitepages',
        jurisdictions: ['us-ccpa'],
        method: 'form',
        optOutUrl: 'https://www.whitepages.com/suppression-requests',
    },
    {
        id: 'beenverified',
        name: 'BeenVerified',
        jurisdictions: ['us-ccpa'],
        method: 'form',
        optOutUrl: 'https://www.beenverified.com/app/optout/search',
    },
    {
        id: 'intelius',
        name: 'Intelius',
        jurisdictions: ['us-ccpa'],
        method: 'form',
        optOutUrl: 'https://www.intelius.com/opt-out/',
    },
    {
        id: 'peoplefinders',
        name: 'PeopleFinders',
        jurisdictions: ['us-ccpa'],
        method: 'form',
        optOutUrl: 'https://www.peoplefinders.com/opt-out',
    },
    {
        id: 'radaris',
        name: 'Radaris',
        jurisdictions: ['us-ccpa'],
        method: 'form',
        optOutUrl: 'https://radaris.com/control/privacy',
    },
    {
        id: 'experian',
        name: 'Experian',
        jurisdictions: ['us-ccpa', 'eu-gdpr'],
        method: 'email',
        email: 'privacy@experian.com',
        privacyPolicyUrl: 'https://www.experian.com/privacy/',
    },
    {
        id: 'equifax',
        name: 'Equifax',
        jurisdictions: ['us-ccpa', 'eu-gdpr'],
        method: 'email',
        email: 'privacy@equifax.com',
        privacyPolicyUrl: 'https://www.equifax.com/privacy/',
    },
];

export const findBroker = (id: string): DataBroker | undefined =>
    DATA_BROKERS.find((b) => b.id === id);
