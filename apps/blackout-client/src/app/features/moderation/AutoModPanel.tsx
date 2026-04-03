import { useMemo, useState } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoom } from '../../hooks/useRoom';
import { KeywordFilterEditor } from './KeywordFilterEditor';

export type KeywordFilterType = 'exact' | 'wildcard' | 'regex';
export type KeywordFilterAction = 'warn' | 'redact' | 'kick' | 'ban';

export interface KeywordFilterRule {
  pattern: string;
  type: KeywordFilterType;
  action: KeywordFilterAction;
}

export interface AutoModConfig {
  keywordFilters: KeywordFilterRule[];
  spamProtection: {
    enabled: boolean;
    maxMessagesPerMinute: number;
    duplicateThreshold: number;
    linkWhitelist: string[];
  };
  raidProtection: {
    enabled: boolean;
    joinRateThreshold: number;
    autoLockdown: boolean;
  };
  newAccountRestrictions: {
    enabled: boolean;
    minAgeHours: number;
    restrictedActions: string[];
  };
}

const EVENT_TYPE = 'co.bmc.automod';

const defaultConfig: AutoModConfig = {
  keywordFilters: [],
  spamProtection: {
    enabled: true,
    maxMessagesPerMinute: 25,
    duplicateThreshold: 3,
    linkWhitelist: [],
  },
  raidProtection: {
    enabled: true,
    joinRateThreshold: 12,
    autoLockdown: true,
  },
  newAccountRestrictions: {
    enabled: false,
    minAgeHours: 24,
    restrictedActions: ['send_messages', 'invite_users'],
  },
};

const parseKeywordFilters = (value: unknown): KeywordFilterRule[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      if (typeof record.pattern !== 'string') return null;
      if (record.type !== 'exact' && record.type !== 'wildcard' && record.type !== 'regex') return null;
      if (record.action !== 'warn' && record.action !== 'redact' && record.action !== 'kick' && record.action !== 'ban') return null;
      return { pattern: record.pattern, type: record.type, action: record.action };
    })
    .filter((item): item is KeywordFilterRule => item !== null);
};

const parseConfig = (content: Record<string, unknown> | undefined): AutoModConfig => {
  if (!content) return defaultConfig;

  const spamRaw = (content.spamProtection && typeof content.spamProtection === 'object'
    ? content.spamProtection
    : {}) as Record<string, unknown>;

  const raidRaw = (content.raidProtection && typeof content.raidProtection === 'object'
    ? content.raidProtection
    : {}) as Record<string, unknown>;

  const newAccountsRaw = (content.newAccountRestrictions && typeof content.newAccountRestrictions === 'object'
    ? content.newAccountRestrictions
    : {}) as Record<string, unknown>;

  return {
    keywordFilters: parseKeywordFilters(content.keywordFilters),
    spamProtection: {
      enabled: spamRaw.enabled === undefined ? defaultConfig.spamProtection.enabled : spamRaw.enabled === true,
      maxMessagesPerMinute:
        typeof spamRaw.maxMessagesPerMinute === 'number' ? Math.max(1, Math.round(spamRaw.maxMessagesPerMinute)) : defaultConfig.spamProtection.maxMessagesPerMinute,
      duplicateThreshold:
        typeof spamRaw.duplicateThreshold === 'number' ? Math.max(1, Math.round(spamRaw.duplicateThreshold)) : defaultConfig.spamProtection.duplicateThreshold,
      linkWhitelist: Array.isArray(spamRaw.linkWhitelist) ? spamRaw.linkWhitelist.filter((entry): entry is string => typeof entry === 'string') : defaultConfig.spamProtection.linkWhitelist,
    },
    raidProtection: {
      enabled: raidRaw.enabled === undefined ? defaultConfig.raidProtection.enabled : raidRaw.enabled === true,
      joinRateThreshold:
        typeof raidRaw.joinRateThreshold === 'number' ? Math.max(1, Math.round(raidRaw.joinRateThreshold)) : defaultConfig.raidProtection.joinRateThreshold,
      autoLockdown: raidRaw.autoLockdown === undefined ? defaultConfig.raidProtection.autoLockdown : raidRaw.autoLockdown === true,
    },
    newAccountRestrictions: {
      enabled:
        newAccountsRaw.enabled === undefined ? defaultConfig.newAccountRestrictions.enabled : newAccountsRaw.enabled === true,
      minAgeHours:
        typeof newAccountsRaw.minAgeHours === 'number' ? Math.max(0, Math.round(newAccountsRaw.minAgeHours)) : defaultConfig.newAccountRestrictions.minAgeHours,
      restrictedActions: Array.isArray(newAccountsRaw.restrictedActions)
        ? newAccountsRaw.restrictedActions.filter((entry): entry is string => typeof entry === 'string')
        : defaultConfig.newAccountRestrictions.restrictedActions,
    },
  };
};

type TabId = 'keywords' | 'spam' | 'raids' | 'new-accounts';

export const AutoModPanel = ({ roomId }: { roomId: string }) => {
  const client = useMatrixClient();
  const roomState = useRoom(roomId);
  const [activeTab, setActiveTab] = useState<TabId>('keywords');
  const [draft, setDraft] = useState<AutoModConfig | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const source = useMemo(() => {
    const event = roomState.data?.currentState.getStateEvents(EVENT_TYPE, '');
    const content = event?.getContent<Record<string, unknown>>();
    return parseConfig(content);
  }, [roomState.data]);

  const config = draft ?? source;

  const setConfig = (updater: (prev: AutoModConfig) => AutoModConfig) => {
    setDraft((prev) => updater(prev ?? source));
    setSaveState('idle');
  };

  const save = async () => {
    setSaveState('saving');
    try {
      await client.sendStateEvent(roomId, EVENT_TYPE as never, config as never, '');
      setDraft(null);
      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      console.error('Failed to save AutoMod settings', error);
    }
  };

  const tabButton = (id: TabId, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setActiveTab(id)}
      style={{
        border: activeTab === id ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
        background: activeTab === id ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
        color: 'var(--text-primary)',
        borderRadius: 8,
        padding: '6px 10px',
      }}
    >
      {label}
    </button>
  );

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header>
        <h3 style={{ margin: 0 }}>AutoMod Configuration</h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          Edits <code>{EVENT_TYPE}</code> state event that Draupnir reads.
        </p>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tabButton('keywords', 'Keywords')}
        {tabButton('spam', 'Spam')}
        {tabButton('raids', 'Raids')}
        {tabButton('new-accounts', 'New Accounts')}
      </div>

      <div style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 12, display: 'grid', gap: 10 }}>
        {activeTab === 'keywords' ? (
          <KeywordFilterEditor
            rules={config.keywordFilters}
            onChange={(rules) => setConfig((prev) => ({ ...prev, keywordFilters: rules }))}
          />
        ) : null}

        {activeTab === 'spam' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={config.spamProtection.enabled}
                onChange={(event) => setConfig((prev) => ({ ...prev, spamProtection: { ...prev.spamProtection, enabled: event.target.checked } }))}
              />{' '}
              Enable spam protection
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              Max messages per minute
              <input
                type="number"
                min={1}
                value={config.spamProtection.maxMessagesPerMinute}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    spamProtection: { ...prev.spamProtection, maxMessagesPerMinute: Math.max(1, Number(event.target.value) || 1) },
                  }))
                }
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              Duplicate message threshold
              <input
                type="number"
                min={1}
                value={config.spamProtection.duplicateThreshold}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    spamProtection: { ...prev.spamProtection, duplicateThreshold: Math.max(1, Number(event.target.value) || 1) },
                  }))
                }
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              Link whitelist (comma-separated domains)
              <textarea
                rows={3}
                value={config.spamProtection.linkWhitelist.join(', ')}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    spamProtection: {
                      ...prev.spamProtection,
                      linkWhitelist: event.target.value
                        .split(',')
                        .map((entry) => entry.trim())
                        .filter(Boolean),
                    },
                  }))
                }
              />
            </label>
          </div>
        ) : null}

        {activeTab === 'raids' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={config.raidProtection.enabled}
                onChange={(event) => setConfig((prev) => ({ ...prev, raidProtection: { ...prev.raidProtection, enabled: event.target.checked } }))}
              />{' '}
              Enable raid protection
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              Join rate threshold (joins/min)
              <input
                type="number"
                min={1}
                value={config.raidProtection.joinRateThreshold}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    raidProtection: { ...prev.raidProtection, joinRateThreshold: Math.max(1, Number(event.target.value) || 1) },
                  }))
                }
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={config.raidProtection.autoLockdown}
                onChange={(event) => setConfig((prev) => ({ ...prev, raidProtection: { ...prev.raidProtection, autoLockdown: event.target.checked } }))}
              />{' '}
              Auto-enable invite-only lockdown
            </label>
          </div>
        ) : null}

        {activeTab === 'new-accounts' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={config.newAccountRestrictions.enabled}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    newAccountRestrictions: { ...prev.newAccountRestrictions, enabled: event.target.checked },
                  }))
                }
              />{' '}
              Enable new account restrictions
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              Minimum account age (hours)
              <input
                type="number"
                min={0}
                value={config.newAccountRestrictions.minAgeHours}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    newAccountRestrictions: {
                      ...prev.newAccountRestrictions,
                      minAgeHours: Math.max(0, Number(event.target.value) || 0),
                    },
                  }))
                }
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              Restricted actions (comma-separated)
              <input
                value={config.newAccountRestrictions.restrictedActions.join(', ')}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    newAccountRestrictions: {
                      ...prev.newAccountRestrictions,
                      restrictedActions: event.target.value
                        .split(',')
                        .map((entry) => entry.trim())
                        .filter(Boolean),
                    },
                  }))
                }
              />
            </label>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saveState === 'saving' || roomState.loading}
          style={{
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            background: 'var(--accent-primary)',
            color: 'var(--bg-surface)',
            padding: '6px 10px',
          }}
        >
          {saveState === 'saving' ? 'Saving…' : 'Save AutoMod settings'}
        </button>
        {saveState === 'saved' ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Saved.</span> : null}
        {saveState === 'error' ? <span style={{ fontSize: 12, color: 'var(--danger)' }}>Save failed.</span> : null}
      </div>
    </section>
  );
};
