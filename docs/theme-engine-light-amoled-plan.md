# Theme Engine Extension: Light + AMOLED Variants

## 1) Token delta strategy

We now maintain a **single base semantic token map** (`baseDarkTokens`) and layer each theme as a sparse patch (`themeDeltas`).

- Base: canonical dark defaults for all semantic tokens.
- Delta: only the token branches that differ (`bg`, `text`, `accent`, `border`, `status`).
- Merge: `mergeThemeTokens(base, delta)` creates full token sets per theme.

Why this helps:
- Avoids token drift between themes.
- Makes light/AMOLED intent explicit and reviewable.
- Makes it easy to add focused tests for only changed tokens.

## 2) Runtime theme switching

Runtime theme switching is centralized in `applyThemeToRoot(root, preference)`.

Behavior:
- Normalizes legacy IDs (`light`, `amoled`, etc.) using `normalizeThemeId`.
- Removes existing theme classes and applies exactly one canonical theme class.
- Sets `data-theme=<theme_id>` for telemetry/debug hooks.
- Sets `color-scheme` (`light` or `dark`) to keep native controls aligned.

This function is called by `ThemeProvider`, so UI changes are immediate when settings update.

## 3) Contrast/accessibility checks

Automated WCAG-focused checks were added:

- `textPrimaryOnSurface >= 4.5:1` (normal text AA)
- `textSecondaryOnSurface >= 4.5:1` (normal text AA)
- `accentOnSurface >= 3:1` (non-text UI indicators)

The check utility computes relative luminance and contrast from semantic theme tokens, then validates all registered themes in unit tests.

## 4) Screenshot regression plan

Recommended CI/PR visual plan:

1. **Capture matrix**: For each major route (Inbox, Room, Settings, Compose), capture screenshots in:
   - `dark_canopy`
   - `light_grove`
   - `amoled_night`
2. **Viewport matrix**:
   - Desktop wide (1440x900)
   - Laptop (1280x720)
3. **State matrix**:
   - Default room
   - Hover/focus states on primary inputs/buttons
   - Modal/dialog surface + form controls
4. **Diff budgets**:
   - Block PR if >0.1% unexpected pixel drift for stable scenes.
   - Require reviewer approval for expected drifts with linked artifacts.
5. **A11y gate before visual approval**:
   - Run theme contrast tests first; only then evaluate screenshots.

Implementation note:
- If Playwright (or equivalent) is adopted, keep per-theme snapshots in separate directories (`__screenshots__/dark_canopy`, etc.) to avoid accidental baseline overwrite.
