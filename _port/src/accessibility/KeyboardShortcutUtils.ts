/*
Copyright 2024 New Vector Ltd.
Copyright 2022 Šimon Brandner <simon.bra.ag@gmail.com>

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type KeyCombo } from "../KeyBindingsManager";
import { IS_MAC, Key } from "../Keyboard";
import { _t, _td } from "../languageHandler";
import PlatformPeg from "../PlatformPeg";
import SettingsStore from "../settings/SettingsStore";
import {
    DESKTOP_SHORTCUTS,
    DIGITS,
    type IKeyboardShortcuts,
    KeyBindingAction,
    KEYBOARD_SHORTCUTS,
    type KeyboardShortcutSetting,
    MAC_ONLY_SHORTCUTS,
} from "./KeyboardShortcuts";

const hasValidDefaultKey = (shortcut: KeyboardShortcutSetting | undefined): shortcut is KeyboardShortcutSetting => {
    return typeof shortcut?.default?.key === "string" && shortcut.default.key.length > 0;
};

const shouldOverrideBrowserShortcuts = (): boolean => {
    try {
        return PlatformPeg.get()?.overrideBrowserShortcuts?.() ?? false;
    } catch {
        return false;
    }
};

/**
 * This function gets the keyboard shortcuts that should be presented in the UI
 * but they shouldn't be consumed by KeyBindingDefaults. That means that these
 * have to be manually mirrored in KeyBindingDefaults.
 */
const getUIOnlyShortcuts = (): IKeyboardShortcuts => {
    const ctrlEnterToSend = SettingsStore.getValue("MessageComposerInput.ctrlEnterToSend");

    const keyboardShortcuts: IKeyboardShortcuts = {
        [KeyBindingAction.SendMessage]: {
            default: {
                key: Key.ENTER,
                ctrlOrCmdKey: ctrlEnterToSend,
            },
            displayName: _td("composer|send_button_title"),
        },
        [KeyBindingAction.NewLine]: {
            default: {
                key: Key.ENTER,
                shiftKey: !ctrlEnterToSend,
            },
            displayName: _td("keyboard|composer_new_line"),
        },
        [KeyBindingAction.CompleteAutocomplete]: {
            default: {
                key: Key.ENTER,
            },
            displayName: _td("action|complete"),
        },
        [KeyBindingAction.ForceCompleteAutocomplete]: {
            default: {
                key: Key.TAB,
            },
            displayName: _td("keyboard|autocomplete_force"),
        },
        [KeyBindingAction.SearchInRoom]: {
            default: {
                ctrlOrCmdKey: true,
                key: Key.F,
            },
            displayName: _td("keyboard|search"),
        },
    };

    if (shouldOverrideBrowserShortcuts()) {
        // This shortcut is intentionally generated, not manually listed in
        // KeyBindingDefaults as it can't be easily handled by the
        // KeyBindingManager
        keyboardShortcuts[KeyBindingAction.SwitchToSpaceByNumber] = {
            default: {
                ctrlOrCmdKey: true,
                key: DIGITS,
            },
            displayName: _td("keyboard|switch_to_space"),
        };
    }

    return keyboardShortcuts;
};

/**
 * This function gets keyboard shortcuts that can be consumed by the KeyBindingDefaults.
 */
export const getKeyboardShortcuts = (): IKeyboardShortcuts => {
    const overrideBrowserShortcuts = shouldOverrideBrowserShortcuts();

    return (Object.keys(KEYBOARD_SHORTCUTS) as KeyBindingAction[])
        .filter((k) => {
            if (KEYBOARD_SHORTCUTS[k]?.controller?.settingDisabled) return false;
            if (MAC_ONLY_SHORTCUTS.includes(k) && !IS_MAC) return false;
            if (DESKTOP_SHORTCUTS.includes(k) && !overrideBrowserShortcuts) return false;
            if (!hasValidDefaultKey(KEYBOARD_SHORTCUTS[k])) return false;

            return true;
        })
        .reduce((o, key) => {
            o[key as KeyBindingAction] = KEYBOARD_SHORTCUTS[key as KeyBindingAction];
            return o;
        }, {} as IKeyboardShortcuts);
};

/**
 * Gets keyboard shortcuts that should be presented to the user in the UI.
 */
export const getKeyboardShortcutsForUI = (): IKeyboardShortcuts => {
    const uiOnlyShortcuts = getUIOnlyShortcuts();
    const managerShortcuts = getKeyboardShortcuts();
    const entries = [...Object.entries(uiOnlyShortcuts), ...Object.entries(managerShortcuts)] as [
        KeyBindingAction,
        KeyboardShortcutSetting,
    ][];

    return entries.reduce((acc, [key, value]) => {
        // Keep deterministic collision behavior: manager-consumable shortcuts override UI-only shortcuts
        // for duplicated actions so that UI and runtime behavior stay aligned.
        if (!hasValidDefaultKey(value)) return acc;
        acc[key] = value;
        return acc;
    }, {} as IKeyboardShortcuts);
};

export const getKeyboardShortcutValue = (name: KeyBindingAction): KeyCombo | undefined => {
    return getKeyboardShortcutsForUI()[name]?.default;
};

export const getKeyboardShortcutDisplayName = (name: KeyBindingAction): string | undefined => {
    const keyboardShortcutDisplayName = getKeyboardShortcutsForUI()[name]?.displayName;
    return keyboardShortcutDisplayName && _t(keyboardShortcutDisplayName);
};
