import type { BrokerJurisdiction, DataBroker } from './registry';

/**
 * Pure, deterministic generation of data-rights request text. The user's
 * identifiers are passed in and used only to render the request body — nothing
 * is stored or sent here. Because the deployment mailer can't set the user as
 * reply-to, the body always restates the requester's contact details so the
 * broker can respond to them directly.
 */

export type RequestKind = 'deletion' | 'access';

export interface RequesterIdentity {
    fullName: string;
    email: string;
    /** Optional, improves broker matching; e.g. ['123 Main St, Portland OR']. */
    addresses?: string[];
    phone?: string;
    /** Free-text extra context (former names, account ids, …). */
    notes?: string;
}

export interface GeneratedRequest {
    subject: string;
    body: string;
}

const STATUTE_CLAUSE: Record<BrokerJurisdiction, Record<RequestKind, string>> = {
    'eu-gdpr': {
        deletion:
            'I am exercising my right to erasure under Article 17 of the EU General Data Protection Regulation (GDPR).',
        access: 'I am exercising my right of access under Article 15 of the EU General Data Protection Regulation (GDPR).',
    },
    'us-ccpa': {
        deletion:
            'I am exercising my right to delete personal information under the California Consumer Privacy Act (CCPA/CPRA), Cal. Civ. Code § 1798.105.',
        access: 'I am exercising my right to know under the California Consumer Privacy Act (CCPA/CPRA), Cal. Civ. Code § 1798.110.',
    },
    'us-other': {
        deletion:
            'I am exercising my right to delete my personal information under applicable U.S. state privacy law.',
        access: 'I am exercising my right to access my personal information under applicable U.S. state privacy law.',
    },
};

const pickJurisdiction = (broker: DataBroker): BrokerJurisdiction =>
    // Prefer GDPR wording when available (broadest), else the first listed.
    broker.jurisdictions.includes('eu-gdpr') ? 'eu-gdpr' : broker.jurisdictions[0] ?? 'us-other';

const actionLine: Record<RequestKind, (name: string) => string> = {
    deletion: (name) =>
        `Please delete all personal information you hold about me (${name}) and direct any service providers or third parties to do the same, and confirm in writing once completed.`,
    access: (name) =>
        `Please provide all personal information you hold about me (${name}), including its sources, the categories of third parties it has been shared with, and the business purpose for collecting it.`,
};

/**
 * Build the subject + body for a deletion or access request to a broker, citing
 * the appropriate statute and restating the requester's contact info.
 */
export const generateBrokerRequest = (
    broker: DataBroker,
    identity: RequesterIdentity,
    kind: RequestKind,
): GeneratedRequest => {
    const jurisdiction = pickJurisdiction(broker);
    const verb = kind === 'deletion' ? 'Deletion' : 'Access';
    const subject = `Data ${verb} Request — ${identity.fullName}`;

    const idLines = [
        `Full name: ${identity.fullName}`,
        `Email: ${identity.email}`,
        ...(identity.phone ? [`Phone: ${identity.phone}`] : []),
        ...(identity.addresses?.length
            ? identity.addresses.map((a, i) => `Address ${i + 1}: ${a}`)
            : []),
        ...(identity.notes ? [`Additional details: ${identity.notes}`] : []),
    ];

    const body = [
        `To the Privacy Officer at ${broker.name},`,
        '',
        STATUTE_CLAUSE[jurisdiction][kind],
        '',
        actionLine[kind](identity.fullName),
        '',
        'You can verify and contact me using the details below:',
        ...idLines,
        '',
        'Please confirm receipt of this request and the action taken within the timeframe required by applicable law.',
        '',
        'Sincerely,',
        identity.fullName,
    ].join('\n');

    return { subject, body };
};
