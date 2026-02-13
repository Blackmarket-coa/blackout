/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import { Form } from "@vector-im/compound-web";

import { _t } from "../../../../../languageHandler";
import { SettingLevel } from "../../../../../settings/SettingLevel";
import SettingsFlag from "../../../elements/SettingsFlag";
import SettingsTab from "../SettingsTab";
import { SettingsSection } from "../../shared/SettingsSection";
import { SettingsSubsection, SettingsSubsectionText } from "../../shared/SettingsSubsection";

export default function SteganographyUserSettingsTab(): JSX.Element {
    return (
        <SettingsTab>
            <Form.Root
                onSubmit={(evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                }}
            >
                <SettingsSection heading={_t("settings|steganography|section_heading")}>
                    <SettingsSubsection heading={_t("settings|steganography|opt_in_heading")}>
                        <SettingsSubsectionText>{_t("settings|steganography|opt_in_detail")}</SettingsSubsectionText>
                        <SettingsFlag name="steganographyOptIn" level={SettingLevel.DEVICE} />
                    </SettingsSubsection>
                </SettingsSection>
            </Form.Root>
        </SettingsTab>
    );
}
