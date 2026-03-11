/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useState } from "react";

interface Props {
    onCreate: (input: { title: string; body: string }) => void;
}

export default function ProposalComposer({ onCreate }: Props): React.JSX.Element {
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
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
        });

        setTitle("");
        setBody("");
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
            <button type="submit" disabled={!canSubmit} data-testid="blackout-proposal-create">
                Create
            </button>
        </form>
    );
}
