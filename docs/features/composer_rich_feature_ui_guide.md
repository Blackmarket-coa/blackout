# Rich Feature Composer UI/UX Guide

This guide proposes a scalable interaction model for organizing advanced capabilities in the Blackout chat composer (steganography, attachments, voice, voting, signatures, and commands) without overwhelming users.

## Recommendation: Progressive Disclosure via a `[+]` Entry Point

Use a single **plus button** as the default launcher for non-core composer features.

### Why this pattern should be default

1. **Cleaner first-run experience**
   - New users only need to understand text input + send.
   - Advanced actions stay available but out of the way.
2. **Better discoverability without clutter**
   - Opening `[+]` reveals the full capability set in one predictable place.
3. **Clear active-state feedback**
   - Selected options (for example, “Steganography: Tier 3”) should render compact chips/badges under the composer so users can verify what is enabled before sending.
4. **Long-term scalability**
   - New features can be added to the menu without redesigning the composer layout.
5. **Mobile resilience**
   - A bottom sheet mapped from the same menu model avoids horizontal toolbar overflow.

## UX Principles

### 1) Preserve a minimal default composer

Default visible controls:
- text input
- send button
- `[+]` feature launcher

Keep secondary actions behind `[+]` unless they are frequently used in the current room context.

### 2) Show state, not controls

When users enable optional features, surface **state chips** below the input instead of persistent icon rows.

Examples:
- `Stego: Tier 3`
- `Vote: 2 options • 24h`
- `Voice: attached`
- `Signature: enabled`

Each chip should support quick edit/remove affordances.

### 3) Prioritize actions by frequency

Inside the menu/sheet, group actions by usage tier:

- **Tier 1 (always visible):** attach file, upload media, quick voice note
- **Tier 2 (secondary):** steganography, poll/vote, slash command picker
- **Tier 3 (advanced):** signed message presets, scheduled send, encryption presets

This structure keeps the interaction model stable while allowing capability growth.

### 4) Maintain keyboard parity for power users

Keep `[+]` as the primary visual path, then add shortcuts incrementally:
- quick launcher shortcut (example: `Cmd/Ctrl+K`)
- slash-triggered actions
- context-aware inline suggestions

## Interaction Blueprint

1. User focuses composer.
2. User taps/clicks `[+]`.
3. Menu (desktop popover / mobile bottom sheet) opens with grouped actions.
4. User selects one or more features.
5. Composer shows active chips beneath input.
6. User sends message with confidence due to visible feature state.

## Implementation Guidance (phased)

### Phase 1: Baseline progressive disclosure
- Introduce `[+]` launcher and grouped action menu.
- Move non-essential composer icons into the menu.
- Add active chips for selected features.

### Phase 2: Efficiency and refinement
- Add keyboard shortcuts for high-frequency features.
- Reorder menu groups using feature telemetry.
- Add quick recents/favorites inside the menu.

### Phase 3: Context intelligence
- Room-type-aware default ordering (for example, governance rooms prioritize polls/voting).
- Lightweight suggestions based on user intent and recent behavior.

## Anti-patterns to avoid

- Expanding persistent composer icon rows as new features are added.
- Making feature activation invisible after menu close.
- Introducing divergent desktop/mobile models that require relearning.
- Shipping a full visual overhaul and interaction model change in one step.

## Success metrics

Track rollout impact with:
- composer send success rate
- first-message time for new users
- menu open-to-action conversion
- per-feature activation and completion rates
- compose abandonment after feature activation

## Practical default

If the team needs a single direction now: **ship Pattern 1 (`[+]` progressive disclosure) as the default, instrument usage, and iterate from observed behavior.**
