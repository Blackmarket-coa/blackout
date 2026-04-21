import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  clearExpiredTemporaryMutesAtom,
  fromNotificationPreferencesAccountData,
  temporaryMuteAtom,
  upsertTemporaryMuteAtom,
  validateNotificationSemanticMapping,
} from '../../../../src/app/state/notifications';

describe('notification settings state', () => {
  it('normalizes account-data payload and filters invalid space presets', () => {
    const normalized = fromNotificationPreferencesAccountData({
      version: 7,
      spaces: {
        '!spaceA:example.org': 'all',
        '!spaceB:example.org': 'none',
        '!spaceC:example.org': 'invalid',
      },
      digest: {
        enabled: true,
        intervalMinutes: 1,
        maxItemsPerDigest: 0,
      },
      updatedAt: '999',
    });

    expect(normalized.version).toBe(1);
    expect(normalized.spaces).toEqual({
      '!spaceA:example.org': 'all',
      '!spaceB:example.org': 'none',
    });
    expect(normalized.digest.intervalMinutes).toBe(5);
    expect(normalized.digest.maxItemsPerDigest).toBe(1);
    expect(normalized.updatedAt).toBe(999);
  });

  it('tracks and clears temporary mute records', () => {
    const store = createStore();

    const now = Date.now();
    store.set(upsertTemporaryMuteAtom, {
      targetId: '!room:example.org',
      durationPreset: '1h',
      now,
    });

    const activeMute = store.get(temporaryMuteAtom('!room:example.org'));
    expect(activeMute).toBeDefined();
    expect(activeMute?.mutedUntil).toBe(now + 60 * 60 * 1000);

    store.set(
      temporaryMuteAtom('!room:example.org'),
      activeMute
        ? {
            ...activeMute,
            mutedUntil: 1,
          }
        : undefined
    );

    store.set(clearExpiredTemporaryMutesAtom);

    expect(store.get(temporaryMuteAtom('!room:example.org'))).toBeUndefined();
  });

  it('rejects semantic mappings that mutate receipts/unread counters', () => {
    const invalid = validateNotificationSemanticMapping({
      accountData: {},
      receiptsTouched: true,
      unreadCounterMutated: false,
    });

    const valid = validateNotificationSemanticMapping({
      accountData: {},
      receiptsTouched: false,
      unreadCounterMutated: false,
    });

    expect(invalid.valid).toBe(false);
    expect(valid.valid).toBe(true);
  });
});
