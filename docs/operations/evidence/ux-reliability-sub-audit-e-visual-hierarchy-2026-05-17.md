# UX Reliability — Sub-audit E (Visual hierarchy) — 2026-05-17

- Branch: `claude/plugin-manifest-fields-e3XO2`
- Base HEAD: `ee801d245c2fae8d7cb8991325ad767efe10894b`
- Rubric source: [`docs/audits/ux-reliability-audit-2026-05-17.md`](../../audits/ux-reliability-audit-2026-05-17.md) §E
- Scope: the diff on this branch — the new home-page "Plugins" card
  section (`HomeFeed.tsx`), pinned-nav sidebar entries
  (`RegistrySidebarList.tsx`-driven), and the `PluginRouteBoundary`
  fallback surface.

| # | Check | Required | Result | Evidence | Notes |
| --- | --- | --- | --- | --- | --- |
| E1 | Primary action is the most visually prominent control on the surface | Yes | Yes | Home plugin cards use the same `cardStyle` / `cardTitleStyle` / `cardSubtitleStyle` tokens as den feed cards (`apps/blackout-client/src/app/features/home/HomeFeed.tsx:60-90, 182-208`), so the primary "open plugin" affordance has the same weight as the existing "open den" cards. Pinned-nav rail buttons reuse the existing rail-link styling driven by `railLinkStyle` (`apps/blackout-client/src/app/core/features/RegistrySidebarList.tsx:28-43`), so installed-plugin entries match the visual weight of core nav. | No new control competes with the cards' Link affordance. |
| E2 | Backdrops/overlays never reduce foreground text contrast below thresholds | Yes | Yes | The only overlay touched is `PluginsView.tsx:289` (background `rgba(0,0,0,.5)`), unchanged by this diff; foreground content sits on `var(--bg-surface)` (`apps/blackout-client/src/app/features/plugins/PluginsView.tsx:299`). No new translucent surfaces introduced. | — |
| E3 | Translucent surfaces are bounded — no stacked translucencies | Yes | Yes | The `PluginRouteBoundary` fallback (`apps/blackout-client/src/app/core/features/PluginRouteBoundary.tsx:11-46`) uses solid `var(--bg-surface)` and `var(--bg-input)` fills, not translucent overlays. The home-plugin-cards section is a flow-layout block, not a layered overlay. | — |
| E4 | Spacing follows design tokens | Yes | Yes | New surfaces use CSS variables (`--bg-surface`, `--bg-input`, `--border-default`, `--text-primary`, `--text-muted`, `--accent-primary`) consistent with the home feed and primary rail. Pixel paddings (`12px 14px`, `20px`, `16px 20px`) match adjacent surfaces (`HomeFeed.tsx:59-67`, `PluginsView.tsx:104-107`). | The audit doc points at `design-tokens.example.json`; this diff stays within values already in use on the home surface. |
| E5 | Icon-only buttons have an accessible label and a hover/focus tooltip | Yes | N/A | No new icon-only buttons in this diff. Pinned-nav rail entries reuse `RegistrySidebarList`'s existing rail rendering, which already sets `aria-label={panel.label}` and `title={panel.label}` (`apps/blackout-client/src/app/core/features/RegistrySidebarList.tsx:128-130`). | — |
| E6 | Loading, empty and error states are distinct and labelled | Yes | Yes | Empty: `home-plugin-cards` section is only rendered when `pluginCards.length > 0` (`apps/blackout-client/src/app/features/home/HomeFeed.tsx:182`), so the existing `home-feed-empty` empty state still wins when no dens are joined and no plugins declare cards. Error: `PluginRouteBoundary` fallback carries `role="alert"`, `data-testid="plugin-route-error"`, an `<h2>` headline, recovery hint, and the error message in a dedicated `<pre>` block (`apps/blackout-client/src/app/core/features/PluginRouteBoundary.tsx:10-46`). Loading state is N/A — plugin route components mount synchronously today; the boundary doesn't introduce one. | The boundary fallback is visually distinct from both empty (`home-feed-empty`) and loaded (`home-feed-list`) home states. |

## Result

Required rows in scope of this diff: **all met**. E5 is N/A for the
diff; it remains binding on the existing FocusTrap-using modals and is
unchanged.
