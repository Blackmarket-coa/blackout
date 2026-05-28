// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import { privacySettingsAtom } from '../../../../src/app/features/settings/settingsAtoms';
import {
    shouldSendReadReceipts,
    shouldSendTypingNotifications,
} from '../../../../src/app/features/metadata-privacy/outboundPrivacy';

const storeWith = (patch: Record<string, unknown>) => {
    const store = createStore();
    store.set(privacySettingsAtom, {
        ...store.get(privacySettingsAtom),
        ...patch,
    });
    return store;
};

describe('outbound privacy guards', () => {
    it('default settings send both receipts and typing', () => {
        const store = createStore();
        expect(shouldSendReadReceipts(store)).toBe(true);
        expect(shouldSendTypingNotifications(store)).toBe(true);
    });

    it('suppress when explicitly disabled', () => {
        const store = storeWith({ sendReadReceipts: false, sendTypingNotifications: false });
        expect(shouldSendReadReceipts(store)).toBe(false);
        expect(shouldSendTypingNotifications(store)).toBe(false);
    });

    it('treat missing flags (legacy stored settings) as "send"', () => {
        // Simulate a persisted object from before these fields existed.
        const store = createStore();
        store.set(privacySettingsAtom, {
            blockedUsers: [],
            dmPermissions: 'friends',
            showReadReceipts: true,
            showTypingIndicators: true,
        } as never);
        expect(shouldSendReadReceipts(store)).toBe(true);
        expect(shouldSendTypingNotifications(store)).toBe(true);
    });
});
