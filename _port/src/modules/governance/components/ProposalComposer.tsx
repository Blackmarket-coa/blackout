/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useState } from "react";

interface Props {
    onCreate: (input: {
        title: string;
        body: string;
        cadence: {
            digestMode: "daily" | "twice_daily" | "manual";
            decisionWindowHours: number;
            engagementLoopProtection: true;
        };
    }) => void;
}

export default function ProposalComposer({ onCreate }: Props): React.JSX.Element {
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [digestMode, setDigestMode] = useState<"daily" | "twice_daily" | "manual">("daily");
    const [decisionWindowHours, setDecisionWindowHours] = useState(48);
    const canSubmit = Boolean(title.trim() && body.trim());

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
        event.preventDefault();

        const trimmedTitle = title.trim();
        const trimmedBody = body.trim();
        if (!trimmedTitle || !trimmedBody) {
            return;
        }

        onCreate({
            title: trimmedTitle,
            body: trimmedBody,
            cadence: {
                digestMode,
                decisionWindowHours,
                engagementLoopProtection: true,
            },
        });

        setTitle("");
        setBody("");
        setDigestMode("daily");
        setDecisionWindowHours(48);
    };

    return (
        <form onSubmit={handleSubmit}>
            <h3>Create proposal</h3>
            <label>
                Title
                <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    name="title"
                    data-testid="blackout-proposal-title"
                />
            </label>
            <label>
                Body
                <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    name="body"
                    data-testid="blackout-proposal-body"
                />
            </label>
            <p>{body.length} characters</p>
            <label>
                Digest cadence
                <select
                    value={digestMode}
                    onChange={(event) => setDigestMode(event.target.value as "daily" | "twice_daily" | "manual")}
                    data-testid="blackout-proposal-digest-mode"
                >
                    <option value="daily">Daily digest (default)</option>
                    <option value="twice_daily">Twice daily digest</option>
                    <option value="manual">Manual digests only</option>
                </select>
            </label>
            <label>
                Decision window
                <select
                    value={decisionWindowHours}
                    onChange={(event) => setDecisionWindowHours(Number(event.target.value))}
                    data-testid="blackout-proposal-decision-window"
                >
                    <option value={24}>24 hours</option>
                    <option value={48}>48 hours (default)</option>
                    <option value={72}>72 hours</option>
                </select>
            </label>
            <button type="submit" disabled={!canSubmit} data-testid="blackout-proposal-create">
                Create
            </button>
        </form>
    );
}
