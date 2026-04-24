export type JoinGatingMode = 'none' | 'captcha' | 'account_age' | 'invite_only';

export type ModerationSettings = {
  bannedWords: string[];
  blockLinks: boolean;
  allowMediaUploads: boolean;
  raidProtectionEnabled: boolean;
  raidJoinThreshold: number;
  slowModeSeconds: number;
  joinGating: JoinGatingMode;
};

export type ModerationPresetId = 'strict' | 'balanced' | 'relaxed';

export type DraupnirRule = {
  id: string;
  kind: 'keyword' | 'link' | 'media' | 'raid' | 'slow_mode' | 'join_gate';
  enabled: boolean;
  parameters: Record<string, unknown>;
};

export type DraupnirPolicyPayload = {
  policyName: string;
  defaults: 'safe';
  rules: DraupnirRule[];
};

export type ReasonCode = 'spam' | 'harassment' | 'illegal_content' | 'evasion' | 'other';

export type QuickAction = 'warn' | 'timeout' | 'mute' | 'ban' | 'redact';

export type IncidentEntry = {
  id: string;
  timestamp: string;
  actorId: string;
  targetId: string;
  action: QuickAction | 'rule_update';
  reasonCode: ReasonCode | 'policy_change';
  summary: string;
  triggerType: 'rule' | 'moderator';
  triggerRuleId?: string;
};

export const moderationPresets: Record<ModerationPresetId, { label: string; description: string; settings: ModerationSettings }> = {
  strict: {
    label: 'Strict',
    description: 'Maximum protection for high-risk rooms.',
    settings: {
      bannedWords: ['scam', 'airdrop', 'free-money'],
      blockLinks: true,
      allowMediaUploads: false,
      raidProtectionEnabled: true,
      raidJoinThreshold: 4,
      slowModeSeconds: 20,
      joinGating: 'captcha',
    },
  },
  balanced: {
    label: 'Balanced',
    description: 'Strong default protections with normal usability.',
    settings: {
      bannedWords: ['scam'],
      blockLinks: false,
      allowMediaUploads: true,
      raidProtectionEnabled: true,
      raidJoinThreshold: 8,
      slowModeSeconds: 10,
      joinGating: 'account_age',
    },
  },
  relaxed: {
    label: 'Relaxed',
    description: 'Lightweight guardrails for trusted communities.',
    settings: {
      bannedWords: [],
      blockLinks: false,
      allowMediaUploads: true,
      raidProtectionEnabled: false,
      raidJoinThreshold: 15,
      slowModeSeconds: 0,
      joinGating: 'none',
    },
  },
};

const API_BASE = 'http://localhost:8787/v1';

let mockSettings: ModerationSettings = { ...moderationPresets.balanced.settings };
let mockIncidents: IncidentEntry[] = [];

function createRulesFromSettings(settings: ModerationSettings): DraupnirRule[] {
  return [
    {
      id: 'kw-banlist',
      kind: 'keyword',
      enabled: settings.bannedWords.length > 0,
      parameters: { terms: settings.bannedWords },
    },
    {
      id: 'link-policy',
      kind: 'link',
      enabled: settings.blockLinks,
      parameters: { action: settings.blockLinks ? 'deny' : 'allow' },
    },
    {
      id: 'media-policy',
      kind: 'media',
      enabled: true,
      parameters: { uploads: settings.allowMediaUploads ? 'allow' : 'deny' },
    },
    {
      id: 'raid-protection',
      kind: 'raid',
      enabled: settings.raidProtectionEnabled,
      parameters: { joinThresholdPerMinute: settings.raidJoinThreshold },
    },
    {
      id: 'slow-mode',
      kind: 'slow_mode',
      enabled: settings.slowModeSeconds > 0,
      parameters: { seconds: settings.slowModeSeconds },
    },
    {
      id: 'join-gating',
      kind: 'join_gate',
      enabled: settings.joinGating !== 'none',
      parameters: { mode: settings.joinGating },
    },
  ];
}

export function buildDraupnirPolicyPreview(settings: ModerationSettings): DraupnirPolicyPayload {
  return {
    policyName: 'community-safe-default',
    defaults: 'safe',
    rules: createRulesFromSettings(settings),
  };
}

export async function loadModerationSettings(): Promise<ModerationSettings> {
  return mockSettings;
}

export async function applyDraupnirPolicy(settings: ModerationSettings, actorId: string): Promise<void> {
  const payload = buildDraupnirPolicyPreview(settings);

  try {
    await fetch(`${API_BASE}/moderation/draupnir/policies/community-safe-default/rules`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // no-op fallback for scaffold environments without Draupnir endpoints
  }

  mockSettings = { ...settings };
  mockIncidents = [
    {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actorId,
      targetId: 'community-policy',
      action: 'rule_update',
      reasonCode: 'policy_change',
      summary: `Updated Draupnir policy with ${payload.rules.filter((rule) => rule.enabled).length} active rules`,
      triggerType: 'rule',
      triggerRuleId: payload.rules.find((rule) => rule.enabled)?.id,
    },
    ...mockIncidents,
  ];
}

export async function runQuickAction(input: {
  communityId: string;
  actorId: string;
  targetId: string;
  action: QuickAction;
  reasonCode: ReasonCode;
  reasonText: string;
}): Promise<void> {
  const mappedAction = input.action === 'redact' ? 'remove_content' : input.action === 'timeout' ? 'mute' : input.action;

  try {
    await fetch(`${API_BASE}/moderation/actions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-blackout-capabilities': 'moderation.write,moderation.read',
      },
      body: JSON.stringify({
        communityId: input.communityId,
        actorId: input.actorId,
        targetId: input.targetId,
        action: mappedAction,
        reason: `[${input.reasonCode}] ${input.reasonText}`,
      }),
    });
  } catch {
    // no-op fallback for scaffold environments
  }

  mockIncidents = [
    {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actorId: input.actorId,
      targetId: input.targetId,
      action: input.action,
      reasonCode: input.reasonCode,
      summary: `${input.action.toUpperCase()} issued (${input.reasonCode})`,
      triggerType: 'moderator',
    },
    ...mockIncidents,
  ];
}

export async function loadIncidentTimeline(): Promise<IncidentEntry[]> {
  return mockIncidents;
}
