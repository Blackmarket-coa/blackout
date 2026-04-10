# Blackout Feature Integration Guide

After copying the migration files into blackout_app, follow these steps to wire
the Blackout features into Cinny's existing UI.

## Directory Structure (what was added)

```
src/
├── lib/bmc-core/           # Business logic (governance, crypto, federation, tokens)
├── app/
│   ├── state/bmc-*.ts      # Jotai atoms (auth, rooms, spaces, navigation, settings, unreads, composer)
│   ├── hooks/bmc-*.ts      # React hooks (Matrix client, room, timeline, power levels, etc.)
│   ├── utils/bmc-*.ts      # Utilities (room helpers, media upload, markdown, events)
│   ├── features/           # 15 feature modules (see below)
│   │   ├── governance/     # Proposals, voting, quorum
│   │   ├── steganography/  # Hidden message encoding in images
│   │   ├── moderation/     # AutoMod, timeouts, Draupnir
│   │   ├── roles/          # Named role system
│   │   ├── forum/          # Thread-first channels
│   │   ├── deaddrop/       # Time-delayed messages
│   │   ├── welcome/        # Onboarding wizard
│   │   ├── call/           # Element Call integration
│   │   ├── navigation/     # Quick switcher (Ctrl+K), inbox
│   │   ├── profile/        # Extended profiles
│   │   ├── settings/       # App settings
│   │   ├── quick-actions/  # Feature flag presets
│   │   ├── right-panel/    # Right panel content
│   │   ├── spaces/         # Space tree
│   │   └── room/           # Room enhancements
│   ├── components/bmc/     # Shared components + UI library
│   ├── styles/             # Vanilla Extract theme
│   └── pages/              # Page components
├── client/                 # Matrix client initialization
└── types/bmc-matrix.ts     # Type definitions
```

## Integration Points

### 1. Governance → Room Right Panel

Wire `GovernanceDashboard` into the room view when a space/room has governance enabled:

```tsx
// In Cinny's room view or right panel:
import { GovernanceDashboard } from '../features/governance';

// Add as a tab in the right panel alongside members, threads, etc.
// Triggered when rightPanelAtom === 'governance'
```

### 2. Steganography → Message Context Menu

Add stego actions to message long-press/right-click:

```tsx
import { HideMessageDialog, RevealMessagePanel } from '../features/steganography';

// Add "Hide message in image" to compose actions
// Add "Reveal hidden message" to image message context menu
```

### 3. Moderation → Room Settings

Wire moderation panels into room admin settings:

```tsx
import { AutoModPanel, TimeoutDialog, ModActionLog } from '../features/moderation';
import { DraupnirRoutePage } from '../features/moderation/draupnir';

// Add "Moderation" tab to room settings for users with kick/ban power
```

### 4. Roles → Member List

Show role badges in member list and add role editor to room settings:

```tsx
import { RoleBadge, RoleEditor } from '../features/roles';

// Wrap member name with <RoleBadge /> in member list
// Add "Roles" section to room settings
```

### 5. Forum → Alternative Room View

Replace standard timeline with forum view when `co.bmc.forum` is set on room:

```tsx
import { ForumView } from '../features/forum';

// Check room state for co.bmc.forum event
// If present, render ForumView instead of standard timeline
```

### 6. Quick Switcher → Global Keyboard Handler

Wire Ctrl+K to open quick switcher:

```tsx
import { QuickSwitcher } from '../features/navigation';

// In app root, listen for Ctrl+K / Cmd+K
// Render <QuickSwitcher /> as modal overlay
```

### 7. Welcome → Space Entry

Show welcome screen on first space join:

```tsx
import { WelcomeScreen, OnboardingWizard } from '../features/welcome';

// Check co.bmc.welcome room state on space entry
// Check co.bmc.onboarding account data for completion
```

### 8. Feature Flags

The feature flag system controls which features are active:

```tsx
import { FEATURE_PRESETS } from '../features/quick-actions/featureEntrypoints';

// Three presets: 'starter' (minimal), 'governance' (mid), 'sovereignty' (full)
// Check individual flags before rendering feature UI
```

### 9. Settings

Add BMC settings sections to Cinny's existing settings:

```tsx
import { AppearanceSettings, DeveloperSettings, PrivacySettings } from '../features/settings';

// Add new tabs/sections alongside Cinny's existing settings
// Steganography settings from features/steganography/StegoSettings.tsx
```

## Custom Matrix Event Types (co.bmc.* namespace)

| Event Type | Kind | Used By |
|---|---|---|
| `co.bmc.proposal` | Room state | Governance |
| `co.bmc.vote` | Room event | Governance |
| `co.bmc.roles` | Room state | Roles |
| `co.bmc.timeout` | Room event | Moderation |
| `co.bmc.automod` | Room state | Moderation |
| `co.bmc.draupnir` | Account data | Moderation |
| `co.bmc.forum` | Room state | Forum |
| `co.bmc.deaddrop` | Room state | Dead Drop |
| `co.bmc.deaddrop.queue` | Room state | Dead Drop |
| `co.bmc.deaddrop.command` | Room event | Dead Drop |
| `co.bmc.welcome` | Room state | Welcome |
| `co.bmc.onboarding` | Account data | Welcome |
| `co.bmc.profile` | User data | Profile |

## State Atom Mapping

BMC atoms use a `bmc-` prefix to avoid collisions with Cinny's existing atoms.
For features that need Cinny's Matrix client, you have two options:

1. **Use Cinny's existing atoms** — if Cinny already has equivalent atoms for rooms,
   client, etc., update feature imports to use those instead of the `bmc-*` versions.

2. **Bridge the atoms** — create a small bridge that syncs Cinny's client atom with
   `bmc-auth.ts`'s `matrixClientAtom`:

```tsx
// In app initialization, after Cinny's client is ready:
import { useSetAtom } from 'jotai';
import { matrixClientAtom } from '../state/bmc-auth';

const setClient = useSetAtom(matrixClientAtom);
setClient(cinnyMatrixClient);
```

## Build Verification

After integration:

```bash
npm run build    # Should complete without type errors
npm run dev      # Dev server should start
npm test         # Run existing + new tests
```
