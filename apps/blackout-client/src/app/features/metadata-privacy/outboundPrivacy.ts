import { getDefaultStore } from 'jotai';
import { privacySettingsAtom } from '../settings/settingsAtoms';

/**
 * Outbound metadata-minimization guards. Read receipts and typing notifications
 * leak who-read-what-when and when-you're-composing; these let the user stop
 * *sending* them. Default-on (a missing/undefined flag means "send") so existing
 * users and fresh installs behave exactly as before until they opt out.
 *
 * Usable from non-React code (utils) via jotai's default store — the same store
 * the app's `useStore()`/`useAtom()` read from.
 */
export interface OutboundPrivacyStore {
    get(atom: typeof privacySettingsAtom): {
        sendReadReceipts?: boolean;
        sendTypingNotifications?: boolean;
    };
}

const readSettings = (store?: OutboundPrivacyStore) =>
    (store ?? (getDefaultStore() as unknown as OutboundPrivacyStore)).get(privacySettingsAtom);

export const shouldSendReadReceipts = (store?: OutboundPrivacyStore): boolean =>
    readSettings(store).sendReadReceipts !== false;

export const shouldSendTypingNotifications = (store?: OutboundPrivacyStore): boolean =>
    readSettings(store).sendTypingNotifications !== false;
