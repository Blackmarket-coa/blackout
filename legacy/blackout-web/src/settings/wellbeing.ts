import type { EngagementPolicy, WellbeingState } from "../types";

export interface BreakPromptDecision {
  shouldPrompt: boolean;
  reason: "disabled" | "max_nudges" | "session_threshold" | "cooldown" | "prompt";
}

const BREAK_PROMPT_SESSION_THRESHOLD_MINUTES = 45;
const BREAK_PROMPT_COOLDOWN_MINUTES = 120;

export function shouldShowBreakPrompt(
  policy: EngagementPolicy,
  state: WellbeingState,
  sessionMinutes: number,
  nowIso: string,
): BreakPromptDecision {
  if (!policy.wellbeing.breakPrompts.enabled) {
    return { shouldPrompt: false, reason: "disabled" };
  }

  if (state.breakPromptsShownToday >= policy.wellbeing.maxNudgesPerDay) {
    return { shouldPrompt: false, reason: "max_nudges" };
  }

  if (sessionMinutes < BREAK_PROMPT_SESSION_THRESHOLD_MINUTES) {
    return { shouldPrompt: false, reason: "session_threshold" };
  }

  if (state.lastBreakPromptAt) {
    const elapsedMs = new Date(nowIso).getTime() - new Date(state.lastBreakPromptAt).getTime();
    if (elapsedMs < BREAK_PROMPT_COOLDOWN_MINUTES * 60_000) {
      return { shouldPrompt: false, reason: "cooldown" };
    }
  }

  return { shouldPrompt: true, reason: "prompt" };
}

export function buildReduceNotificationsAction(policy: EngagementPolicy): EngagementPolicy {
  return {
    ...policy,
    wellbeing: {
      ...policy.wellbeing,
      maxNudgesPerDay: Math.max(1, Math.floor(policy.wellbeing.maxNudgesPerDay * 0.5)),
    },
  };
}
