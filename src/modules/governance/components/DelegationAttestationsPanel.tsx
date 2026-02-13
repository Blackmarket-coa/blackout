/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useMemo, useState } from "react";

import { AttestationGraph, type AttestationKind } from "../../../services/attestations/attestationGraph";
import { DelegationGraph, type DelegationResolution } from "../../../services/delegation/DelegationGraph";

const DEFAULT_TOPIC = "general";

export default function DelegationAttestationsPanel(): React.JSX.Element {
    const delegationGraph = useMemo(() => new DelegationGraph(), []);
    const attestationGraph = useMemo(() => new AttestationGraph(), []);

    const [topic, setTopic] = useState(DEFAULT_TOPIC);
    const [fromUserId, setFromUserId] = useState("@alice:example.org");
    const [toUserId, setToUserId] = useState("@bob:example.org");
    const [directVoterInput, setDirectVoterInput] = useState("@bob:example.org");
    const [directVoters, setDirectVoters] = useState<string[]>([]);
    const [resolution, setResolution] = useState<DelegationResolution>();
    const [delegationError, setDelegationError] = useState<string>();

    const [issuerUserId, setIssuerUserId] = useState("@moderator:example.org");
    const [subjectUserId, setSubjectUserId] = useState("@alice:example.org");
    const [kind, setKind] = useState<AttestationKind>("trust");
    const [attestationTopic, setAttestationTopic] = useState(DEFAULT_TOPIC);
    const [weightInput, setWeightInput] = useState("1");
    const [signature, setSignature] = useState("demo-signature");
    const [attestationError, setAttestationError] = useState<string>();
    const [attestationCount, setAttestationCount] = useState(0);

    const trustBreakdown = attestationGraph.getTrustScore(subjectUserId, attestationTopic);
    const credentialStatus = attestationGraph.getCredentialStatus(subjectUserId, attestationTopic);

    const handleSetDelegation = (): void => {
        setDelegationError(undefined);

        try {
            delegationGraph.setDelegation(topic, fromUserId, toUserId);
        } catch (error) {
            setDelegationError((error as Error).message);
        }
    };

    const handleClearDelegation = (): void => {
        setDelegationError(undefined);
        delegationGraph.clearDelegation(topic, fromUserId);
    };

    const handleAddDirectVoter = (): void => {
        if (!directVoterInput) {
            return;
        }

        setDirectVoters((current) => [...new Set([...current, directVoterInput])]);
        setDirectVoterInput("");
    };

    const handleResolve = (): void => {
        setResolution(delegationGraph.resolve(topic, fromUserId, new Set(directVoters)));
    };

    const handleAddAttestation = (): void => {
        setAttestationError(undefined);

        try {
            attestationGraph.addAttestation({
                id: `${issuerUserId}->${subjectUserId}:${kind}:${Date.now()}`,
                issuerUserId,
                subjectUserId,
                kind,
                topic: attestationTopic,
                weight: Number(weightInput),
                issuedAt: Date.now(),
                signature,
            });
            setAttestationCount(attestationGraph.edgeCount());
        } catch (error) {
            setAttestationError((error as Error).message);
        }
    };

    return (
        <section data-testid="blackout-governance-delegation-attestations">
            <h3>Delegation & Attestations</h3>

            <label>
                Topic
                <input
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    data-testid="blackout-delegation-topic"
                />
            </label>
            <label>
                Delegator
                <input
                    value={fromUserId}
                    onChange={(event) => setFromUserId(event.target.value)}
                    data-testid="blackout-delegation-from"
                />
            </label>
            <label>
                Delegate
                <input
                    value={toUserId}
                    onChange={(event) => setToUserId(event.target.value)}
                    data-testid="blackout-delegation-to"
                />
            </label>
            <button type="button" onClick={handleSetDelegation} data-testid="blackout-delegation-set">
                Save delegation
            </button>
            <button type="button" onClick={handleClearDelegation}>
                Clear delegation
            </button>

            <div>
                <label>
                    Direct voter
                    <input
                        value={directVoterInput}
                        onChange={(event) => setDirectVoterInput(event.target.value)}
                        data-testid="blackout-direct-voter-input"
                    />
                </label>
                <button type="button" onClick={handleAddDirectVoter} data-testid="blackout-direct-voter-add">
                    Add direct voter
                </button>
            </div>

            <button type="button" onClick={handleResolve} data-testid="blackout-delegation-resolve">
                Explain delegation weight
            </button>

            {resolution && (
                <p data-testid="blackout-delegation-resolution">
                    Effective voter: {resolution.effectiveVoter} ({resolution.reason}) via{" "}
                    {resolution.path.join(" -> ")}
                </p>
            )}
            {delegationError && <p data-testid="blackout-delegation-error">{delegationError}</p>}

            <hr />

            <label>
                Issuer
                <input
                    value={issuerUserId}
                    onChange={(event) => setIssuerUserId(event.target.value)}
                    data-testid="blackout-attestation-issuer"
                />
            </label>
            <label>
                Subject
                <input
                    value={subjectUserId}
                    onChange={(event) => setSubjectUserId(event.target.value)}
                    data-testid="blackout-attestation-subject"
                />
            </label>
            <label>
                Kind
                <select
                    value={kind}
                    onChange={(event) => setKind(event.target.value as AttestationKind)}
                    data-testid="blackout-attestation-kind"
                >
                    <option value="trust">trust</option>
                    <option value="credential">credential</option>
                </select>
            </label>
            <label>
                Topic
                <input
                    value={attestationTopic}
                    onChange={(event) => setAttestationTopic(event.target.value)}
                    data-testid="blackout-attestation-topic"
                />
            </label>
            <label>
                Weight
                <input
                    value={weightInput}
                    onChange={(event) => setWeightInput(event.target.value)}
                    data-testid="blackout-attestation-weight"
                />
            </label>
            <label>
                Signature
                <input
                    value={signature}
                    onChange={(event) => setSignature(event.target.value)}
                    data-testid="blackout-attestation-signature"
                />
            </label>
            <button type="button" onClick={handleAddAttestation} data-testid="blackout-attestation-add">
                Add attestation
            </button>

            <p data-testid="blackout-attestation-count">Active attestations: {attestationCount}</p>
            <p data-testid="blackout-attestation-trust-score">Trust score: {trustBreakdown.score}</p>
            <p data-testid="blackout-attestation-credential-status">
                Credential status: {credentialStatus.hasCredential ? "verified" : "not verified"}
            </p>

            {attestationError && <p data-testid="blackout-attestation-error">{attestationError}</p>}
        </section>
    );
}
