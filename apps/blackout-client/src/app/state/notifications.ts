import { atom } from 'jotai';
import { atomFamily, atomWithStorage } from 'jotai/utils';

export type SpaceNotificationPreset = 'all' | 'mentions' | 'none';
export type TemporaryMuteDurationPreset = '1h' | '8h' | '24h' | 'custom';

export interface TemporaryMute {
  targetId: string;
  scope: 'room' | 'space';
  startedAt: number;
  mutedUntil: number;
  durationMs: number;
  durationPreset: TemporaryMuteDurationPreset;
}

export interface LowPriorityDigestSettings {
  enabled: boolean;
  intervalMinutes: number;
  maxItemsPerDigest: number;
}

export interface NotificationPreferencesAccountData {
  version: 1;
  spaces: Record<string, SpaceNotificationPreset>;
  digest: LowPriorityDigestSettings;
  updatedAt: number;
}

const DEFAULT_DIGEST_SETTINGS: LowPriorityDigestSettings = {
  enabled: false,
  intervalMinutes: 30,
  maxItemsPerDigest: 12,
};

const DEFAULT_ACCOUNT_DATA: NotificationPreferencesAccountData = {
  version: 1,
  spaces: {},
  digest: DEFAULT_DIGEST_SETTINGS,
  updatedAt: 0,
};

const TEMPORARY_MUTE_DURATIONS: Record<Exclude<TemporaryMuteDurationPreset, 'custom'>, number> = {
  '1h': 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

const roomTemporaryMuteAtom = atomWithStorage<Record<string, TemporaryMute>>(
  'blackout.notifications.temp-mutes.room.v1',
  {}
);

const spacePresetAtom = atomWithStorage<Record<string, SpaceNotificationPreset>>(
  'blackout.notifications.space-presets.v1',
  {}
);

const digestSettingsAtom = atomWithStorage<LowPriorityDigestSettings>(
  'blackout.notifications.digest.v1',
  DEFAULT_DIGEST_SETTINGS
);

export const temporaryMuteAtom = atomFamily((targetId: string) =>
  atom(
    (get) => {
      const active = get(roomTemporaryMuteAtom)[targetId];
      if (!active) return undefined;
      if (active.mutedUntil <= Date.now()) return undefined;
      return active;
    },
    (get, set, next: TemporaryMute | undefined) => {
      const current = get(roomTemporaryMuteAtom);
      if (!next) {
        const { [targetId]: _, ...rest } = current;
        set(roomTemporaryMuteAtom, rest);
        return;
      }

      set(roomTemporaryMuteAtom, {
        ...current,
        [targetId]: next,
      });
    }
  )
);

export const upsertTemporaryMuteAtom = atom(
  null,
  (
    _get,
    set,
    payload: {
      targetId: string;
      scope?: 'room' | 'space';
      durationPreset: TemporaryMuteDurationPreset;
      customDurationMs?: number;
      now?: number;
    }
  ) => {
    const now = payload.now ?? Date.now();
    const durationMs =
      payload.durationPreset === 'custom'
        ? Math.max(payload.customDurationMs ?? 0, 60 * 1000)
        : TEMPORARY_MUTE_DURATIONS[payload.durationPreset];

    set(temporaryMuteAtom(payload.targetId), {
      targetId: payload.targetId,
      scope: payload.scope ?? 'room',
      startedAt: now,
      mutedUntil: now + durationMs,
      durationMs,
      durationPreset: payload.durationPreset,
    });
  }
);

export const clearExpiredTemporaryMutesAtom = atom(null, (get, set) => {
  const now = Date.now();
  const current = get(roomTemporaryMuteAtom);
  const filtered = Object.fromEntries(
    Object.entries(current).filter(([, mute]) => mute.mutedUntil > now)
  );
  set(roomTemporaryMuteAtom, filtered);
});

export const spaceNotificationPresetAtom = atomFamily((spaceId: string) =>
  atom(
    (get): SpaceNotificationPreset => get(spacePresetAtom)[spaceId] ?? 'mentions',
    (get, set, next: SpaceNotificationPreset) => {
      const current = get(spacePresetAtom);
      set(spacePresetAtom, {
        ...current,
        [spaceId]: next,
      });
    }
  )
);

export const digestPreferencesAtom = atom(
  (get): LowPriorityDigestSettings => get(digestSettingsAtom),
  (get, set, next: Partial<LowPriorityDigestSettings>) => {
    const previous = get(digestSettingsAtom);
    set(digestSettingsAtom, {
      ...previous,
      ...next,
    });
  }
);

export const notificationPreferencesAccountDataAtom = atom((get): NotificationPreferencesAccountData => {
  const spaces = get(spacePresetAtom);
  const digest = get(digestSettingsAtom);

  return {
    version: 1,
    spaces,
    digest,
    updatedAt: Date.now(),
  };
});

export const fromNotificationPreferencesAccountData = (
  raw: unknown
): NotificationPreferencesAccountData => {
  if (!raw || typeof raw !== 'object') return DEFAULT_ACCOUNT_DATA;

  const value = raw as Partial<NotificationPreferencesAccountData>;

  const spaces =
    value.spaces && typeof value.spaces === 'object'
      ? Object.fromEntries(
          Object.entries(value.spaces).filter(([, preset]) =>
            preset === 'all' || preset === 'mentions' || preset === 'none'
          )
        )
      : {};

  const digest: LowPriorityDigestSettings = {
    enabled: Boolean(value.digest?.enabled),
    intervalMinutes: Math.max(5, Number(value.digest?.intervalMinutes ?? 30)),
    maxItemsPerDigest: Math.max(1, Number(value.digest?.maxItemsPerDigest ?? 12)),
  };

  return {
    version: 1,
    spaces,
    digest,
    updatedAt: Number(value.updatedAt ?? 0),
  };
};

/**
 * Matrix semantic mapping notes:
 * - Space presets + digest are account-data concerns and map cleanly to global account data.
 * - Temporary mutes are client-side scheduling state; they must not emit read receipts.
 * - Unread totals derive from room timeline + receipts, so this config should not mutate unread counters.
 */
export const validateNotificationSemanticMapping = (payload: {
  accountData: unknown;
  receiptsTouched: boolean;
  unreadCounterMutated: boolean;
}): { valid: boolean; reason?: string } => {
  const normalized = fromNotificationPreferencesAccountData(payload.accountData);
  if (normalized.version !== 1) {
    return { valid: false, reason: 'Unsupported notification preference schema.' };
  }
  if (payload.receiptsTouched) {
    return { valid: false, reason: 'Notification preferences must not write Matrix receipts.' };
  }
  if (payload.unreadCounterMutated) {
    return { valid: false, reason: 'Notification preferences must not directly mutate unread counters.' };
  }

  return { valid: true };
};
