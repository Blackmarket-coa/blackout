import type { EngagementPolicy, NotificationRule } from "../types";

export interface NotificationCandidate {
  feature: string;
  category: string;
  kind: "engagement" | "transactional";
  timestamp: Date;
}

export interface NotificationRuleContext {
  sentToday: number;
  categoryMuted: boolean;
  lastSentAtByFeature: Record<string, string | undefined>;
}

export interface NotificationRulesResult {
  allowed: boolean;
  reason: "allowed" | "policy_disabled" | "hard_cap" | "quiet_hours" | "category_muted" | "cooldown";
}

function toMinutes(value: string): number {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText ?? "0");
  const minute = Number(minuteText ?? "0");
  return (hour * 60) + minute;
}

function isWithinQuietHours(date: Date, rule: NotificationRule): boolean {
  if (!rule.quietHours) return false;

  const currentMinutes = (date.getUTCHours() * 60) + date.getUTCMinutes();
  const start = toMinutes(rule.quietHours.startUtc);
  const end = toMinutes(rule.quietHours.endUtc);

  if (start === end) return false;
  if (start < end) return currentMinutes >= start && currentMinutes < end;
  return currentMinutes >= start || currentMinutes < end;
}

export function evaluateNotificationCandidate(
  candidate: NotificationCandidate,
  policy: EngagementPolicy,
  rule: NotificationRule,
  context: NotificationRuleContext,
): NotificationRulesResult {
  if (candidate.kind === "engagement" && policy.notifications.mode === "minimal") {
    return { allowed: false, reason: "policy_disabled" };
  }

  if (context.categoryMuted) {
    return { allowed: false, reason: "category_muted" };
  }

  const cap = Math.min(rule.hardCapPerDay, policy.wellbeing.maxNudgesPerDay);
  if (candidate.kind === "engagement" && context.sentToday >= cap) {
    return { allowed: false, reason: "hard_cap" };
  }

  if (isWithinQuietHours(candidate.timestamp, rule)) {
    return { allowed: false, reason: "quiet_hours" };
  }

  const lastSentAt = context.lastSentAtByFeature[candidate.feature];
  if (lastSentAt) {
    const elapsedMs = candidate.timestamp.getTime() - new Date(lastSentAt).getTime();
    if (elapsedMs < rule.cooldownMinutes * 60_000) {
      return { allowed: false, reason: "cooldown" };
    }
  }

  return { allowed: true, reason: "allowed" };
}
