/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { ClientEvent, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { Toast } from "@vector-im/compound-web";
import React, { type JSX, useCallback, useContext, useEffect, useState } from "react";
import UserProfileIcon from "@vector-im/compound-design-tokens/assets/web/icons/user-profile";
import DevicesIcon from "@vector-im/compound-design-tokens/assets/web/icons/devices";
import VisibilityOnIcon from "@vector-im/compound-design-tokens/assets/web/icons/visibility-on";
import NotificationsIcon from "@vector-im/compound-design-tokens/assets/web/icons/notifications";
import PreferencesIcon from "@vector-im/compound-design-tokens/assets/web/icons/preferences";
import KeyboardIcon from "@vector-im/compound-design-tokens/assets/web/icons/keyboard";
import KeyIcon from "@vector-im/compound-design-tokens/assets/web/icons/key";
import SidebarIcon from "@vector-im/compound-design-tokens/assets/web/icons/sidebar";
import MicOnIcon from "@vector-im/compound-design-tokens/assets/web/icons/mic-on";
import LockIcon from "@vector-im/compound-design-tokens/assets/web/icons/lock";
import VisibilityOffIcon from "@vector-im/compound-design-tokens/assets/web/icons/visibility-off";
import LabsIcon from "@vector-im/compound-design-tokens/assets/web/icons/labs";
import BlockIcon from "@vector-im/compound-design-tokens/assets/web/icons/block";
import HelpIcon from "@vector-im/compound-design-tokens/assets/web/icons/help";
import CloseIcon from "@vector-im/compound-design-tokens/assets/web/icons/close";
import classNames from "classnames";

import { _t } from "../../languageHandler";
import { UserTab } from "../views/dialogs/UserTab";
import AccountUserSettingsTab from "../views/settings/tabs/user/AccountUserSettingsTab";
import SessionManagerTab from "../views/settings/tabs/user/SessionManagerTab";
import AppearanceUserSettingsTab from "../views/settings/tabs/user/AppearanceUserSettingsTab";
import NotificationUserSettingsTab from "../views/settings/tabs/user/NotificationUserSettingsTab";
import PreferencesUserSettingsTab from "../views/settings/tabs/user/PreferencesUserSettingsTab";
import KeyboardUserSettingsTab from "../views/settings/tabs/user/KeyboardUserSettingsTab";
import SidebarUserSettingsTab from "../views/settings/tabs/user/SidebarUserSettingsTab";
import VoiceUserSettingsTab from "../views/settings/tabs/user/VoiceUserSettingsTab";
import SecurityUserSettingsTab from "../views/settings/tabs/user/SecurityUserSettingsTab";
import { EncryptionUserSettingsTab } from "../views/settings/tabs/user/EncryptionUserSettingsTab";
import SteganographyUserSettingsTab from "../views/settings/tabs/user/SteganographyUserSettingsTab";
import LabsUserSettingsTab, { showLabsFlags } from "../views/settings/tabs/user/LabsUserSettingsTab";
import MjolnirUserSettingsTab from "../views/settings/tabs/user/MjolnirUserSettingsTab";
import HelpUserSettingsTab from "../views/settings/tabs/user/HelpUserSettingsTab";
import SettingsStore from "../../settings/SettingsStore";
import { UIFeature } from "../../settings/UIFeature";
import { useSettingValue } from "../../hooks/useSettings";
import { NoChange, useEventEmitterAsyncState, type AsyncStateCallbackResult } from "../../hooks/useEventEmitter";
import { SDKContext } from "../../contexts/SDKContext";
import { ToastContext, useActiveToast } from "../../contexts/ToastContext";
import AutoHideScrollbar from "./AutoHideScrollbar";
import dis from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";

interface NavItem {
    id: UserTab;
    label: string;
    icon: JSX.Element;
    showAlert?: boolean;
}

interface NavSection {
    header: string;
    items: NavItem[];
}

interface Props {
    initialTabId?: UserTab;
}

function SettingsNavItem({
    item,
    isActive,
    onClick,
}: {
    item: NavItem;
    isActive: boolean;
    onClick: (id: UserTab) => void;
}): JSX.Element {
    return (
        <button
            className={classNames("mx_SettingsPage_navItem", {
                "mx_SettingsPage_navItem--active": isActive,
            })}
            aria-selected={isActive}
            role="tab"
            onClick={() => onClick(item.id)}
        >
            <span className="mx_SettingsPage_navItemIcon">{item.icon}</span>
            <span className="mx_SettingsPage_navItemLabel">{item.label}</span>
            {item.showAlert && <span className="mx_SettingsPage_navItemAlert" aria-hidden="true" />}
        </button>
    );
}

export default function SettingsPage({ initialTabId }: Props): JSX.Element {
    const sdkContext = useContext(SDKContext);
    const voipEnabled = useSettingValue(UIFeature.Voip);
    const mjolnirEnabled = useSettingValue("feature_mjolnir");

    const [activeTabId, setActiveTabId] = useState<UserTab>(initialTabId ?? UserTab.Account);

    const showSetupRecoveryIndicator = useEventEmitterAsyncState(
        sdkContext.client,
        ClientEvent.AccountData,
        async (event?: MatrixEvent): AsyncStateCallbackResult<boolean> => {
            if (event === undefined || event.getType() === "m.secret_storage.default_key") {
                const client = sdkContext.client;
                if (!client) {
                    return false;
                }
                return !(await client.secretStorage.getDefaultKeyId());
            }
            return new NoChange();
        },
        [],
        false,
    );

    const onClose = useCallback((): void => {
        dis.fire(Action.ViewHomePage);
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    const [activeToast, toastRack] = useActiveToast();

    const sections: NavSection[] = [
        {
            header: _t("settings|page|section_user_settings"),
            items: [
                { id: UserTab.Account, label: _t("settings|account|title"), icon: <UserProfileIcon /> },
                { id: UserTab.SessionManager, label: _t("settings|sessions|title"), icon: <DevicesIcon /> },
                { id: UserTab.Appearance, label: _t("common|appearance"), icon: <VisibilityOnIcon /> },
                {
                    id: UserTab.Notifications,
                    label: _t("notifications|enable_prompt_toast_title"),
                    icon: <NotificationsIcon />,
                },
                { id: UserTab.Preferences, label: _t("common|preferences"), icon: <PreferencesIcon /> },
                { id: UserTab.Keyboard, label: _t("settings|keyboard|title"), icon: <KeyboardIcon /> },
                { id: UserTab.Sidebar, label: _t("settings|sidebar|title"), icon: <SidebarIcon /> },
                ...(voipEnabled
                    ? [{ id: UserTab.Voice, label: _t("settings|voip|title"), icon: <MicOnIcon /> }]
                    : []),
            ],
        },
        {
            header: _t("settings|page|section_privacy_security"),
            items: [
                {
                    id: UserTab.Security,
                    label: _t("room_settings|security|title"),
                    icon: <LockIcon />,
                },
                {
                    id: UserTab.Encryption,
                    label: _t("settings|encryption|title"),
                    icon: <KeyIcon />,
                    showAlert: showSetupRecoveryIndicator,
                },
                {
                    id: UserTab.Steganography,
                    label: _t("settings|steganography|title"),
                    icon: <VisibilityOffIcon />,
                },
            ],
        },
        {
            header: _t("settings|page|section_advanced"),
            items: [
                ...(showLabsFlags() || SettingsStore.getFeatureSettingNames().some((k) => SettingsStore.getBetaInfo(k))
                    ? [{ id: UserTab.Labs, label: _t("common|labs"), icon: <LabsIcon /> }]
                    : []),
                ...(mjolnirEnabled
                    ? [{ id: UserTab.Mjolnir, label: _t("labs_mjolnir|title"), icon: <BlockIcon /> }]
                    : []),
                { id: UserTab.Help, label: _t("setting|help_about|title"), icon: <HelpIcon /> },
            ],
        },
    ];

    function renderActiveTab(): JSX.Element | null {
        switch (activeTabId) {
            case UserTab.Account:
                return <AccountUserSettingsTab closeSettingsFn={onClose} />;
            case UserTab.SessionManager:
                return <SessionManagerTab />;
            case UserTab.Appearance:
                return <AppearanceUserSettingsTab />;
            case UserTab.Notifications:
                return <NotificationUserSettingsTab />;
            case UserTab.Preferences:
                return <PreferencesUserSettingsTab closeSettingsFn={onClose} />;
            case UserTab.Keyboard:
                return <KeyboardUserSettingsTab />;
            case UserTab.Sidebar:
                return <SidebarUserSettingsTab />;
            case UserTab.Voice:
                return <VoiceUserSettingsTab />;
            case UserTab.Security:
                return <SecurityUserSettingsTab closeSettingsFn={onClose} />;
            case UserTab.Encryption:
                return <EncryptionUserSettingsTab />;
            case UserTab.Steganography:
                return <SteganographyUserSettingsTab />;
            case UserTab.Labs:
                return <LabsUserSettingsTab />;
            case UserTab.Mjolnir:
                return <MjolnirUserSettingsTab />;
            case UserTab.Help:
                return <HelpUserSettingsTab />;
            default:
                return null;
        }
    }

    return (
        <ToastContext.Provider value={toastRack}>
            <div className="mx_SettingsPage" role="dialog" aria-label={_t("settings|page|title")}>
                <div className="mx_SettingsPage_sidebar" role="tablist" aria-orientation="vertical">
                    {sections.map((section) => (
                        <div key={section.header} className="mx_SettingsPage_section">
                            <h3 className="mx_SettingsPage_sectionHeader">{section.header}</h3>
                            {section.items.map((item) => (
                                <SettingsNavItem
                                    key={item.id}
                                    item={item}
                                    isActive={activeTabId === item.id}
                                    onClick={setActiveTabId}
                                />
                            ))}
                        </div>
                    ))}

                    <button
                        className="mx_SettingsPage_closeButton"
                        onClick={onClose}
                        aria-label={_t("action|close")}
                    >
                        <CloseIcon />
                        <span>{_t("settings|page|close_settings")}</span>
                    </button>
                </div>

                <div className="mx_SettingsPage_content">
                    <AutoHideScrollbar element="div" className="mx_SettingsPage_scrollable">
                        <div className="mx_SettingsPage_contentInner">{renderActiveTab()}</div>
                    </AutoHideScrollbar>
                    {activeToast && (
                        <div className="mx_SettingsPage_toastContainer">
                            <Toast>{activeToast}</Toast>
                        </div>
                    )}
                </div>
            </div>
        </ToastContext.Provider>
    );
}
