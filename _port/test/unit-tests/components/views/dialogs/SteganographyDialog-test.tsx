/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { render, waitFor, fireEvent } from "jest-matrix-react";

import SteganographyDialog from "../../../../../src/components/views/dialogs/SteganographyDialog";
import dis from "../../../../../src/dispatcher/dispatcher";
import { Action } from "../../../../../src/dispatcher/actions";
import { TimelineRenderingType } from "../../../../../src/contexts/RoomContext";
import { encodeSteganographyMessage, containsSteganographyMessage } from "../../../../../src/utils/Steganography";

jest.mock("../../../../../src/utils/Steganography", () => ({
    encodeSteganographyMessage: jest.fn(),
    decodeSteganographyMessage: jest.fn(),
    containsSteganographyMessage: jest.fn(),
}));

describe("SteganographyDialog", () => {
    const onFinished = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(dis, "dispatch").mockImplementation(jest.fn());
        (containsSteganographyMessage as jest.Mock).mockReturnValue(false);
        (encodeSteganographyMessage as jest.Mock).mockResolvedValue("encoded-message");
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("dispatches a room composer insert action when inserting encoded text", async () => {
        const { container, getByTestId, getByText } = render(<SteganographyDialog onFinished={onFinished} />);

        const coverText = container.querySelector("#mx_SteganographyDialog_coverText") as HTMLTextAreaElement;
        const secretText = container.querySelector("#mx_SteganographyDialog_secret") as HTMLTextAreaElement;

        fireEvent.change(coverText, { target: { value: "public cover" } });
        fireEvent.change(secretText, { target: { value: "hidden secret" } });

        fireEvent.click(getByTestId("dialog-primary-button"));

        await waitFor(() => expect(getByText("Insert into composer")).toBeInTheDocument());

        fireEvent.click(getByText("Insert into composer"));

        expect(dis.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                action: Action.ComposerInsert,
                text: "encoded-message",
                timelineRenderingType: TimelineRenderingType.Room,
            }),
        );
        expect(onFinished).toHaveBeenCalled();
    });
});
