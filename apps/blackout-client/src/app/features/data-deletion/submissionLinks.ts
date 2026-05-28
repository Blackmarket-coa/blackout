import type { DataBroker, GeneratedRequest } from '@blackout/core';

/**
 * Build a `mailto:` link for an email-channel broker. Uses encodeURIComponent
 * (spaces → %20) rather than URLSearchParams (spaces → +) because some mail
 * clients render `+` literally in the body. Returns null for form brokers.
 *
 * Note: long bodies can exceed mailto length limits in some clients — always
 * pair this with a "copy request" affordance carrying the full text.
 */
export const buildMailto = (broker: DataBroker, request: GeneratedRequest): string | null => {
    if (broker.method !== 'email' || !broker.email) return null;
    const email = encodeURIComponent(broker.email);
    const subject = encodeURIComponent(request.subject);
    const body = encodeURIComponent(request.body);
    return `mailto:${email}?subject=${subject}&body=${body}`;
};

/** The page the user should open for a form-channel broker. */
export const formTarget = (broker: DataBroker): string | null =>
    broker.method === 'form' ? broker.optOutUrl ?? null : null;
