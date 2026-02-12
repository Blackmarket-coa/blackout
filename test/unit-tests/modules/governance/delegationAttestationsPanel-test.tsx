/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { fireEvent, render, screen } from "jest-matrix-react";

import DelegationAttestationsPanel from "../../../../src/modules/governance/components/DelegationAttestationsPanel";

describe("DelegationAttestationsPanel", () => {
    it("explains delegation paths based on direct voters", () => {
        render(<DelegationAttestationsPanel />);

        fireEvent.change(screen.getByTestId("blackout-delegation-from"), { target: { value: "@alice:example.org" } });
        fireEvent.change(screen.getByTestId("blackout-delegation-to"), { target: { value: "@bob:example.org" } });
        fireEvent.click(screen.getByTestId("blackout-delegation-set"));

        fireEvent.change(screen.getByTestId("blackout-direct-voter-input"), { target: { value: "@bob:example.org" } });
        fireEvent.click(screen.getByTestId("blackout-direct-voter-add"));
        fireEvent.click(screen.getByTestId("blackout-delegation-resolve"));

        expect(screen.getByTestId("blackout-delegation-resolution")).toHaveTextContent(
            "Effective voter: @bob:example.org (delegation_chain) via @alice:example.org -> @bob:example.org",
        );
    });

    it("adds attestations and updates trust score", () => {
        render(<DelegationAttestationsPanel />);

        fireEvent.change(screen.getByTestId("blackout-attestation-kind"), { target: { value: "trust" } });
        fireEvent.change(screen.getByTestId("blackout-attestation-weight"), { target: { value: "0.4" } });
        fireEvent.click(screen.getByTestId("blackout-attestation-add"));

        expect(screen.getByTestId("blackout-attestation-count")).toHaveTextContent("Active attestations: 1");
        expect(screen.getByTestId("blackout-attestation-trust-score")).toHaveTextContent("Trust score: 0.4");
    });
});
