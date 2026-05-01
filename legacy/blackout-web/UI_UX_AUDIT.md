# Blackout Web UI/UX Audit (March 2026)

## What was audited
- Header hierarchy and readability
- Feature discoverability and action speed
- Messaging workflow clarity (channel navigation, composer, and send flow)
- Visual affordance/feedback consistency

## Findings
1. **Top controls lacked hierarchy**
   - The control strip had weak framing, so users could miss where to start.
2. **Feature discovery had redundant paths but no clear “primary path”**
   - Quick-access dropdown and settings registry co-existed, but neither felt like the primary first-click experience.
3. **Feature toolbar needed state feedback**
   - Feature shortcuts were visible but didn’t visually reflect the user’s current selected feature.

## Applied improvements
1. **Added guidance in header controls**
   - Introduced a short “Workspace controls” helper area to explain shortcuts vs. settings.
2. **Strengthened top-toolbar affordance**
   - Kept shortcut chips as the primary, top-level feature interaction path.
3. **Added selected state for feature chips**
   - Feature chips now visually indicate the active/last-selected feature for better orientation.
4. **Improved responsive control behavior**
   - Header controls now stretch more gracefully on smaller screens.

## Recommended next iteration
- Replace the feature dropdown with a command palette (`⌘K` / `Ctrl+K`) to reduce visual density.
- Add iconography per feature category and short tooltips for first-time users.
- Introduce a compact mode for high-density channels and message-heavy sessions.
