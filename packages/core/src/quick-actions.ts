/** Minimal message shape used only by detectMessageKind. */
interface TimelineMessage {
  msgtype?: string;
  type?: string;
  eventType?: string;
}

export type VineAction = {
  label: string;
  primary?: boolean;
};

export type SelectionTarget =
  | { kind: "message"; eventId: string }
  | { kind: "avatar"; eventId: string };

export type DomainId = "governance" | "trade" | "logistics" | "discover";

/**
 * Casual / generic radial labels — the eight that the original wheel was
 * built around and that every den (including Hearth) still gets.
 */
export type CasualRadialLabel =
  | "Vote"
  | "People"
  | "Create"
  | "Map"
  | "Events"
  | "Settings"
  | "Message"
  | "Search";

/**
 * Governance wedges — only surfaced when the den's playbook has the
 * matching feature flag (treasury, rounds, roles). The brief calls these
 * out as "the single most important governance UI surface on mobile."
 */
export type GovernanceRadialLabel =
  | "Propose"
  | "Round"
  | "Consent"
  | "Role"
  | "Treasury"
  | "Party";

export type RadialLabel = CasualRadialLabel | GovernanceRadialLabel;

export type RadialAction = {
  label: RadialLabel;
  angle: number;
  /** Optional indicator — the wheel pulses this wedge when true. */
  pulses?: boolean;
};

export const DOMAIN_ACTIONS: Record<DomainId, string[]> = {
  governance: ["Active votes", "Results", "Proposals", "Delegates"],
  trade: ["Marketplace", "Payments", "My orders"],
  logistics: ["Tracking", "Fleet", "Routing"],
  discover: ["Coliseum", "Communities", "Featured"],
};

/**
 * The original 8-wedge casual radial. Kept for back-compat — existing
 * call sites without a playbook context still consume this constant.
 * Governance dens go through `selectRadialActions(ctx)` instead.
 */
export const RADIAL_ACTIONS: RadialAction[] = [
  { label: "Vote", angle: 0 },
  { label: "People", angle: 45 },
  { label: "Create", angle: 90 },
  { label: "Map", angle: 135 },
  { label: "Events", angle: 180 },
  { label: "Settings", angle: 225 },
  { label: "Message", angle: 270 },
  { label: "Search", angle: 315 },
];

/**
 * Subset of playbook feature flags the selector actually cares about.
 * Mirrors the shape of `PlaybookFeatures` so callers can pass the playbook
 * record straight through, but stays here so `@blackout/core` doesn't
 * depend on `@blackout/protocol`.
 */
export interface RadialFeatureFlags {
  governanceActive?: boolean;
  treasury?: boolean;
  rounds?: boolean;
  roles?: boolean;
}

export interface RadialContext {
  /** Whether the den has a governance-active playbook (Hearth → false). */
  playbookActive?: boolean;
  /** Per-feature flags from the den's playbook. */
  features?: RadialFeatureFlags;
  /** True when there's at least one item in the user's awaits-me list. */
  awaitsMe?: boolean;
  /** Number of joined members; some wedges (Party) require ≥ 3. */
  memberCount?: number;
}

const CASUAL_SLIM: RadialAction[] = [
  { label: "Message", angle: 0 },
  { label: "People", angle: 90 },
  { label: "Settings", angle: 180 },
  { label: "Search", angle: 270 },
];

/**
 * Context-derived wedge selector.
 *
 *   • No context / casual den → the slim 4-wedge layout (chat-shaped dens).
 *   • Governance-active → Message / People / Propose / Round / Consent /
 *     Role / Treasury? / Settings, with Consent pulsing whenever
 *     `awaitsMe` is true. Wedges whose feature flag is off get dropped so
 *     the wheel stays glanceable.
 *   • Party wedge surfaces when memberCount ≥ 3 — small dens don't form
 *     parties out of themselves.
 *
 * Angles are recomputed so the surviving wedges are evenly distributed.
 */
export function selectRadialActions(ctx: RadialContext = {}): RadialAction[] {
  const f = ctx.features ?? {};
  if (!ctx.playbookActive) {
    return CASUAL_SLIM;
  }

  const labels: RadialLabel[] = ["Message", "People"];
  if (f.governanceActive) labels.push("Propose");
  if (f.rounds) labels.push("Round");
  if (f.governanceActive) labels.push("Consent");
  if (f.roles) labels.push("Role");
  if (f.treasury) labels.push("Treasury");
  if ((ctx.memberCount ?? 0) >= 3) labels.push("Party");
  labels.push("Settings");

  const step = 360 / labels.length;
  return labels.map((label, index) => ({
    label,
    angle: Math.round(index * step),
    pulses: label === "Consent" ? ctx.awaitsMe === true : undefined,
  }));
}

export function detectMessageKind(message: TimelineMessage): "proposal" | "file" | "plain" {
  const msgtype = message.msgtype ?? message.type;

  if (message.eventType === "m.room.proposal" || msgtype === "app.blackout.proposal") {
    return "proposal";
  }
  if (msgtype === "m.image" || msgtype === "m.file" || msgtype === "m.video") {
    return "file";
  }
  if (msgtype === "m.text") {
    return "plain";
  }
  return "plain";
}

export function getMessageActions(message: TimelineMessage): VineAction[] {
  const kind = detectMessageKind(message);
  if (kind === "proposal") {
    return [
      { label: "Vote yes", primary: true },
      { label: "Thread" },
      { label: "Share" },
      { label: "React" },
    ];
  }
  if (kind === "file") {
    return [{ label: "Download" }, { label: "Preview" }, { label: "Share" }, { label: "Pin" }];
  }
  return [{ label: "React" }, { label: "Thread" }, { label: "Forward" }, { label: "Pin" }, { label: "Flag" }];
}

export function getAvatarActions(): VineAction[] {
  return [{ label: "DM" }, { label: "View profile" }, { label: "Trade" }, { label: "Follow" }];
}
