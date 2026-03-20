# Blackout Mobile UI Patterns

## Patterns to implement in web code (mobile breakpoints)

- **Bottom tab navigation** for Home / Rooms / Calls / Settings.
- **Swipe gestures** for room switching (left/right gesture handler).
- **Pull-to-refresh** for sync resumption and timeline refresh.
- **Floating action button** for quick compose/new DM/new room.
- **Adaptive tablet layout** using split-pane at larger widths.

## Suggested implementation strategy

- Keep core state/hooks from web app.
- Add a mobile shell route that enables these patterns on narrow screens.
- Wire haptics feedback for major actions (send, archive, join room).
