# Blackout

Encrypted. Cooperative. Sovereign.

A cross-platform Matrix chat client built for the Black Market Coalition ecosystem. One codebase → mobile (iOS + Android), web, and desktop.

## Architecture

### Monorepo layout (completed target)

```text
blackout/  (monorepo root)
│
├─ apps/
│  ├─ blackout-client        # main frontend (Cinny-based)
│  │   ├─ core shell
│  │   ├─ feature registry
│  │   ├─ routes/nav/settings
│  │   └─ feature plugins
│  │       ├─ chat
│  │       ├─ governance
│  │       ├─ forum
│  │       ├─ deaddrop
│  │       ├─ moderation
│  │       └─ steganography
│  │
│  ├─ blackout-server        # backend
│  │   ├─ auth
│  │   ├─ db
│  │   ├─ middleware
│  │   └─ feature modules
│  │       ├─ governance
│  │       ├─ forum
│  │       ├─ deaddrop
│  │       └─ moderation
│  │
│  └─ blackout-gov           # optional separate surface
│
├─ packages/
│  ├─ blackout-protocol      # shared event types + schemas
│  ├─ blackout-sdk           # shared API/network helpers
│  ├─ core                   # shared runtime logic
│  ├─ contracts              # API contracts
│  ├─ config                 # config/env helpers
│  ├─ design                 # tokens/themes
│  ├─ ui                     # shared UI
│  └─ web                    # web-specific helpers
│
├─ blackout-desktop
├─ blackout-mobile
│
├─ legacy/
│  └─ element                # preserved Element-era code not in active path
│
├─ tools/
├─ test/
├─ pnpm-workspace.yaml
├─ turbo.json
└─ package.json
```

### Runtime flow

```text
User
  │
  ▼
blackout-client
  │
  ├─ loads feature plugins from registry
  │
  ├─ uses @blackout/sdk for actions
  │
  ▼
@blackout/sdk
  │
  ├─ uses shared types from @blackout/protocol
  │
  ▼
blackout-server
  │
  ├─ validates/contracts
  ├─ runs feature module logic
  ├─ stores data
  └─ emits/handles feature events
```

### Feature-domain flow (governance / forum / deaddrop / moderation / chat)

```text
Feature Plugin in Client
   │
   ├─ UI components
   ├─ routes
   ├─ nav items
   ├─ settings entries
   └─ capability checks
        │
        ▼
   @blackout/sdk
        │
        ▼
   blackout-server module
        │
        ▼
   shared event/contracts in @blackout/protocol
```

### Operating rules

- `blackout-client` owns the user-facing experience.
- `blackout-server` owns backend behavior.
- `blackout-protocol` owns shared meaning.
- `blackout-sdk` owns client/server wiring.
- Legacy Element-era code stays isolated under `legacy/element`.

### Mental model

```text
Cinny UI shell
   + modular features
   + shared sdk
   + shared protocol
   + modular backend
```

## Prerequisites

Install these in order:

### 1. Node.js (v20+)

```bash
# macOS / Linux
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Windows: use nvm-windows
# https://github.com/coreybutler/nvm-windows
```

### 2. pnpm

```bash
npm install -g pnpm
```

### 3. Turborepo

```bash
pnpm install -g turbo
```

### 4. Expo CLI + EAS CLI

```bash
pnpm install -g expo-cli eas-cli
eas login  # create account at https://expo.dev
```

### 5. Platform tools (for native builds)

**iOS (Mac only):**
- Xcode from Mac App Store
- `xcode-select --install`
- `sudo gem install cocoapods`

**Android:**
- Android Studio from https://developer.android.com/studio
- Install Android 14 (API 34) SDK
- Set `ANDROID_HOME` in your shell profile

**Neither needed for initial development** — Expo Go on your phone works without any native toolchain.

## Quick Start

```bash
# Clone the repo
git clone https://github.com/Blackmarket-coa/blackout.git
cd blackout

# Install all dependencies
pnpm install

# Start the mobile app
pnpm dev:mobile
# Press 'i' for iOS simulator, 'a' for Android emulator
# Or scan the QR code with Expo Go on your phone
# Or press 'w' to open in browser

# Start everything
pnpm dev
```

## Configuration

The mobile app connects to your Blackout homeserver. Update the default URL in:

```
apps/mobile/app/auth/login.tsx
```

Change the `homeserver` state default from `https://matrix.blackout.coop` to your server URL.

## Project Structure

### packages/core

| File | Purpose |
|------|---------|
| `src/client.ts` | Matrix client init, login, sync, logout |
| `src/session.ts` | Platform-agnostic session storage interface |
| `src/hooks/useAuth.ts` | Authentication state management |
| `src/hooks/useRooms.ts` | Reactive room list from Matrix sync |
| `src/hooks/useTimeline.ts` | Message timeline with pagination |
| `src/hooks/useSendMessage.ts` | Send text, replies, reactions, edits |
| `src/hooks/useDeepDive.ts` | Room discovery (swipe-to-join) |
| `src/events/governance.ts` | BMC governance events (proposals, votes, delegation) |

### apps/mobile

| File | Purpose |
|------|---------|
| `polyfills.ts` | Web API polyfills for React Native |
| `lib/session-storage.ts` | SecureStore implementation for token persistence |
| `lib/auth-context.tsx` | React context wrapping useAuth |
| `app/_layout.tsx` | Root layout with auth guard |
| `app/auth/login.tsx` | Login screen |
| `app/(tabs)/_layout.tsx` | Bottom tab navigation |
| `app/(tabs)/index.tsx` | Messages tab (room list) |
| `app/(tabs)/deepdive.tsx` | DeepDive discovery feed |
| `app/(tabs)/spaces.tsx` | Spaces browser (placeholder) |
| `app/(tabs)/profile.tsx` | Profile & settings |
| `app/room/[roomId].tsx` | Chat room with timeline + composer |

## Building for Production

```bash
cd apps/mobile

# Build for iOS
eas build --platform ios --profile production

# Build for Android
eas build --platform android --profile production

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

## Roadmap

- [ ] E2EE (vodozemac or libolm)
- [ ] Media messages (images, files, audio)
- [ ] Voice/video calls (LiveKit / MatrixRTC)
- [ ] Governance UI (proposals, voting, delegation)
- [ ] Tauri desktop app
- [ ] Steganography features
- [ ] BMC ecosystem bridges (FBM orders, Blackstar delivery)
- [ ] Blackbox hardware provisioning

## License

AGPL-3.0 — See LICENSE for details.

Part of the [Black Market Coalition](https://github.com/Blackmarket-coa) ecosystem.
