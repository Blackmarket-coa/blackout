/**
 * What a coalition asks of someone before it admits them.
 *
 * Shared by the founding form and the settings form so the two cannot drift —
 * a coalition that could set a bar at founding but not change it later, or the
 * reverse, is the kind of asymmetry nobody notices until a founder needs it.
 *
 * The copy does real work here. Founders get told, on the screen where they
 * choose, that requirements are checked once and that nobody is ever refused
 * outright — because both are true of the server and neither is guessable from
 * a set of number inputs.
 */
import type { ChangeEvent } from 'react';
import {
    COALITION_TIER_GATES,
    type CoalitionJoinRequirements,
    type CoalitionTierGate,
} from '@blackout/core';

import { inputStyle, mutedStyle, sectionLabelStyle } from './coalitionsStyles';

export interface JoinRequirementsValue {
    minTier: CoalitionTierGate | '';
    requirements: CoalitionJoinRequirements;
}

export const EMPTY_JOIN_REQUIREMENTS: JoinRequirementsValue = {
    minTier: '',
    requirements: {},
};

/** Read a bounded whole number out of an input, or drop the key entirely. */
function withNumber(
    requirements: CoalitionJoinRequirements,
    key: 'minAccountAgeDays' | 'minReputationScore' | 'minCoalitionContributions',
    raw: string
): CoalitionJoinRequirements {
    const next = { ...requirements };
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) next[key] = parsed;
    else delete next[key];
    return next;
}

export function JoinRequirementsFields({
    value,
    onChange,
    idPrefix,
}: {
    value: JoinRequirementsValue;
    onChange: (next: JoinRequirementsValue) => void;
    /** Namespaces the test ids so the founding and settings forms stay distinct. */
    idPrefix: string;
}) {
    const { minTier, requirements } = value;
    const setRequirements = (next: CoalitionJoinRequirements) =>
        onChange({ minTier, requirements: next });
    const numberField = (
        key: 'minAccountAgeDays' | 'minReputationScore' | 'minCoalitionContributions'
    ) => ({
        value: requirements[key] === undefined ? '' : String(requirements[key]),
        onChange: (e: ChangeEvent<HTMLInputElement>) =>
            setRequirements(withNumber(requirements, key, e.target.value)),
    });

    return (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            <legend style={sectionLabelStyle}>Who can join</legend>
            <span style={mutedStyle}>
                Leave these blank and your join setting alone decides. Anything you set is checked
                once, when someone asks to join — members already in are never re-checked. Nobody is
                ever turned away outright: a request that misses a bar goes to your Stewards to
                decide.
            </span>

            <label style={{ display: 'grid', gap: 4 }}>
                <span style={mutedStyle}>Account age, in days</span>
                <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    max={3650}
                    placeholder="No minimum"
                    data-testid={`${idPrefix}-min-account-age`}
                    {...numberField('minAccountAgeDays')}
                />
            </label>

            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <input
                    type="checkbox"
                    checked={requirements.requireVerifiedEmail === true}
                    data-testid={`${idPrefix}-require-verified-email`}
                    onChange={(e) => {
                        const next = { ...requirements };
                        if (e.target.checked) next.requireVerifiedEmail = true;
                        else delete next.requireVerifiedEmail;
                        setRequirements(next);
                    }}
                />
                <span style={mutedStyle}>Must have a verified email address</span>
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
                <span style={mutedStyle}>Reputation score</span>
                <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    placeholder="No minimum"
                    data-testid={`${idPrefix}-min-reputation`}
                    {...numberField('minReputationScore')}
                />
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
                <span style={mutedStyle}>Past contributions to any coalition drive</span>
                <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    placeholder="No minimum"
                    data-testid={`${idPrefix}-min-contributions`}
                    {...numberField('minCoalitionContributions')}
                />
            </label>

            <label style={{ display: 'grid', gap: 4 }}>
                <span style={mutedStyle}>Minimum KARMA tier</span>
                <select
                    style={inputStyle}
                    value={minTier}
                    data-testid={`${idPrefix}-min-tier`}
                    onChange={(e) =>
                        onChange({
                            minTier: e.target.value as CoalitionTierGate | '',
                            requirements,
                        })
                    }
                >
                    <option value="">No minimum</option>
                    {COALITION_TIER_GATES.map((tier) => (
                        <option key={tier} value={tier}>
                            {tier}
                        </option>
                    ))}
                </select>
                <span style={mutedStyle}>
                    Earned by coalition work across the network. This is the one bar we ask another
                    service about, so it can sometimes be unanswerable — when it is, the request
                    goes to your Stewards rather than being counted as a miss.
                </span>
            </label>
        </fieldset>
    );
}

/**
 * Short phrases naming what a coalition asks, for the directory card and the
 * coalition header. Empty when it asks nothing.
 *
 * Shown to everyone, not just would-be joiners: a bar someone cannot see is a
 * door that just does not open for them.
 */
export function describeJoinRequirements(coalition: {
    minTierToJoin?: CoalitionTierGate;
    joinRequirements?: CoalitionJoinRequirements;
}): string[] {
    const out: string[] = [];
    const asked = coalition.joinRequirements;
    if (asked?.minAccountAgeDays !== undefined) {
        out.push(`${asked.minAccountAgeDays}d old account`);
    }
    if (asked?.requireVerifiedEmail) out.push('verified email');
    if (asked?.minReputationScore !== undefined) {
        out.push(`${asked.minReputationScore} reputation`);
    }
    if (asked?.minCoalitionContributions !== undefined) {
        const n = asked.minCoalitionContributions;
        out.push(`${n} past contribution${n === 1 ? '' : 's'}`);
    }
    if (coalition.minTierToJoin) out.push(`${coalition.minTierToJoin}+ tier`);
    return out;
}

/** Build the API payload. An empty requirements object is sent as absent. */
export function toJoinRequirementsPayload(value: JoinRequirementsValue): {
    minTierToJoin: CoalitionTierGate | null;
    joinRequirements: CoalitionJoinRequirements | null;
} {
    const entries = Object.entries(value.requirements).filter(([, v]) => v !== undefined);
    return {
        minTierToJoin: value.minTier || null,
        joinRequirements: entries.length > 0 ? value.requirements : null,
    };
}
