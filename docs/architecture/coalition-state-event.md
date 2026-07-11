# Coalition State Event — `co.bmc.coalition`

The `co.bmc.coalition` state event turns an ordinary Matrix room into a
**Coalition** — the map-first mutual-aid surface with its tab strip (map, chat,
events, needs, projects, shop, …). This document is the narrative companion to
the source of truth, `packages/core/src/coalition/events.ts`; federation peers
and plugin authors should treat that module's exported constants as canonical
and this doc as the explanation.

## At a glance

| Property       | Value                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| Event type     | `co.bmc.coalition` (`events.ts:1`, `COALITION_STATE_EVENT_TYPE`)             |
| State key      | `''` (empty — one Coalition config per room)                                 |
| Where it lives | Matrix **room state**                                                        |
| Who sets it    | A room admin/moderator (standard `m.room.power_levels` gate on state writes) |
| Read helper    | `resolveEnabledTabs(content)` (`events.ts:22`)                               |

The event is read from room state with the empty state key, e.g. in the client
via `room.currentState.getStateEvents('co.bmc.coalition', '')` — see
`apps/blackout-client/src/app/features/coalition/useCoalitionState.ts:21-24`.

## Content shape

Defined by `CoalitionStateEventContent` (`events.ts:10-16`):

```jsonc
{
    "enabled": true, // required — master on/off switch
    "defaultTab": "map", // optional — CoalitionTabId, defaults to "map"
    "enabledTabs": ["map", "chat", "needs"], // optional — subset of the tab set; omit/[] ⇒ all tabs
    "canopyId": "!canopy:example.org", // optional — parent canopy this coalition belongs to
    "description": "Neighborhood mutual-aid hub" // optional — human-readable blurb
}
```

### `enabled` (boolean, required)

The master switch. When `false` (or the event is absent), the room is **not** a
Coalition: `resolveEnabledTabs` returns `[]` and the client renders no tab strip
(`events.ts:25`; `useCoalitionState.ts:33-35`). Flipping `enabled` to `false` is
the intended way to "turn off" a Coalition without deleting the event.

### `defaultTab` (CoalitionTabId, optional)

The tab shown first when a member opens the Coalition. Defaults to
`DEFAULT_COALITION_TAB`, which is `map` (`events.ts:8`) — the product is
deliberately map-first, and videos surface as pins on the map rather than as a
standalone tab. If `defaultTab` names a tab that is not in `enabledTabs`,
consumers should fall back to the first enabled tab.

### `enabledTabs` (CoalitionTabId[], optional)

Which tabs render, and in what order. The full set is `COALITION_TABS`
(`events.ts:3`), 12 values:

`map`, `chat`, `events`, `rings`, `shop`, `tasks`, `needs`, `projects`,
`resources`, `kits`, `documents`, `ai`.

Resolution semantics (`resolveEnabledTabs`, `events.ts:22-30`):

-   **Omitted or empty (`[]`)** ⇒ **all** tabs are enabled (a Coalition with no
    explicit list gets the full experience).
-   **Non-empty** ⇒ exactly that list, **filtered** through `isValidCoalitionTab`
    (`events.ts:18-20`) so unknown/forward-compatible tab ids from a newer peer are
    silently dropped rather than rendered as broken tabs.

This filter is the forward-compat contract: an older client meeting a Coalition
that lists a tab id it doesn't know will drop that entry and keep working.

### `canopyId` (string, optional)

The identifier of the parent **canopy** this Coalition belongs to. A canopy is
the higher-level grouping that Coalition content is scoped under — the same
`canopyId` threads through canopy-scoped records elsewhere in `@blackout/core`
(e.g. `coalition/needs.ts:28`, `coalition/projects.ts:37`,
`coalition/resources.ts:25`) and feed/pin items (`coalition/feed.ts:37,48`). It
lets multiple Coalition rooms roll up to one canopy for cross-room discovery and
map aggregation. Optional: a standalone Coalition may have no canopy.

### `description` (string, optional)

A short human-readable blurb surfaced in Coalition headers/listings
(`useCoalitionState.ts:39`). Free text; no length contract is enforced at the
protocol layer.

## Related exports in `events.ts`

-   `COALITION_TABS` (`events.ts:3`) — the readonly tuple of valid tab ids; also the
    source of the `CoalitionTabId` union type (`events.ts:4`).
-   `DEFAULT_COALITION_TAB` (`events.ts:8`) — `'map'`.
-   `isValidCoalitionTab(value)` (`events.ts:18`) — type guard used by
    `resolveEnabledTabs` to filter unknown tab ids.
-   `resolveEnabledTabs(content)` (`events.ts:22`) — the one function consumers
    should call; encapsulates the enabled/empty/filter rules above.

## For plugin & federation authors

-   Always go through `resolveEnabledTabs` rather than reading `enabledTabs`
    directly — it centralizes the "empty means all" and unknown-tab-filtering
    rules, so your surface stays consistent with the client.
-   Adding a new tab is a two-step protocol change: append it to `COALITION_TABS`
    in `events.ts`, then have surfaces render it. Until a peer ships the new value,
    `isValidCoalitionTab` keeps older clients safe.
-   Treat the event as authoritative room configuration: honor `enabled === false`
    as "not a Coalition", and never assume a tab is present just because you can
    render it — check the resolved list first.
