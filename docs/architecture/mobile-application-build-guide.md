> **Superseded.** This describes an earlier Expo/React Native mobile approach (March 2026) that is
> no longer current — the mobile shell is now Capacitor-based (`blackout-mobile/`). See the
> canonical guide at [`/mobile-application-build-guide.md`](../../mobile-application-build-guide.md).
> Kept here for historical reference only.

# BLACKOUT Mobile Application Build Guide

**Turborepo Monorepo · React Native (Expo) · matrix-js-sdk**  
**Black Market Coalition · March 2026**

## 1. Development Environment Setup

Before touching any code, ensure your local environment is set up from scratch.

### 1.1 Hardware Requirements

- **iOS builds require macOS** (Xcode only runs on Mac).
- **Windows/Linux** can build Android and web.
- iOS builds can be produced later via **EAS Build** or Mac-based CI.

### 1.2 Install Core Tools

Install in this order:

1. **Node.js (v20 LTS+)**
   ```bash
   # macOS / Linux
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.bashrc   # or ~/.zshrc on macOS
   nvm install 20
   nvm use 20
   node --version
   ```
   - Windows: use nvm-windows: https://github.com/coreybutler/nvm-windows

2. **pnpm**
   ```bash
   npm install -g pnpm
   pnpm --version
   ```

3. **Turborepo CLI**
   ```bash
   pnpm install -g turbo
   turbo --version
   ```

4. **Git**
   ```bash
   # macOS
   xcode-select --install

   # Linux
   sudo apt install git
   ```
   - Windows: https://git-scm.com

5. **Expo/EAS CLI**
   ```bash
   pnpm install -g expo-cli eas-cli
   eas --version
   eas login
   ```

### 1.3 Platform-Specific Setup

#### iOS (Mac only)

- Install Xcode and open it once.
- Accept license and install CLI tools:
  ```bash
  xcode-select --install
  ```
- Install CocoaPods:
  ```bash
  sudo gem install cocoapods
  ```
- Download iOS 17+ Simulator in Xcode settings.

> Apple Developer Program ($99/year) is required only for App Store submission.

#### Android

- Install Android Studio with SDK + AVD.
- Install Android 14 (API 34) SDK + build-tools.
- Create emulator in Virtual Device Manager.
- Add env vars:
  ```bash
  # Linux
  export ANDROID_HOME=$HOME/Android/Sdk

  # macOS
  export ANDROID_HOME=$HOME/Library/Android/sdk

  export PATH=$PATH:$ANDROID_HOME/emulator
  export PATH=$PATH:$ANDROID_HOME/platform-tools
  ```

> Google Play Console account is a one-time $25 fee for publishing only.

#### Web

No additional setup required.

## 2. Monorepo Architecture

A single codebase targets web, desktop, and mobile:

```text
blackout/
├── apps/
│   ├── mobile/          # Expo (React Native)
│   ├── web/             # Vite + React
│   └── desktop/         # Tauri wrapper around web/
├── packages/
│   ├── core/            # Matrix logic, auth, sync, custom events
│   ├── ui/              # Shared web/mobile components
│   ├── config/          # TS/ESLint/Prettier and brand tokens
│   └── crypto/          # E2EE wrapper
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### 2.1 Package Roles

- **`packages/core`**: Matrix client, auth, rooms, timeline, events.
- **`packages/ui`**: Shared UI primitives and feature components.
- **`packages/config`**: Tooling and design token source of truth.
- **`packages/crypto`**: Encryption integration layer.

### 2.2 Dependency Flow

```text
apps/mobile  ───┐
apps/web     ───┼───▶ packages/ui ───▶ packages/core ───▶ packages/crypto
apps/desktop ───┘                               │
                                             packages/config
```

## 3. Scaffolding the Monorepo

### 3.1 Root Setup

```bash
mkdir blackout && cd blackout
git init
pnpm init
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "build/**", ".expo/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

Root `package.json` scripts:

```json
{
  "name": "blackout",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "dev:mobile": "turbo dev --filter=@blackout/mobile",
    "dev:web": "turbo dev --filter=@blackout/web",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck"
  },
  "packageManager": "pnpm@9.15.0"
}
```

### 3.2 `packages/config`

Create and initialize package metadata, plus design tokens (colors/spacing).

### 3.3 `packages/core`

Create hooks and Matrix primitives:

- `client.ts`
- `hooks/useAuth.ts`
- `hooks/useRooms.ts`
- `hooks/useTimeline.ts`
- `hooks/useSendMessage.ts`
- `hooks/useEncryption.ts`
- `events/governance.ts`
- `events/deepdive.ts`

### 3.4 `apps/mobile` (Expo)

```bash
cd apps/
pnpm create expo-app mobile --template blank-typescript
cd mobile
```

Add workspace dependencies:

- `@blackout/core`
- `@blackout/config`

Add Expo and RN dependencies:

- `expo`
- `expo-router`
- `react`
- `react-native`
- `matrix-js-sdk`
- `expo-secure-store`
- `expo-notifications`
- `expo-haptics`

Configure Metro for monorepo in `apps/mobile/metro.config.js` and migrate `app.json` to `app.config.ts`.

## 4. Matrix SDK Integration for React Native

### 4.1 Polyfills

Install:

```bash
pnpm add react-native-url-polyfill text-encoding-polyfill \
  react-native-get-random-values @craftzdog/react-native-buffer
```

Create `apps/mobile/polyfills.ts` and import it first in app entry.

### 4.2 Client Initialization

Use `matrix-js-sdk` to create client and login flow; start sync after auth.

### 4.3 Session Persistence

Use `expo-secure-store` for mobile session token persistence (not localStorage).

### 4.4 E2EE Strategy

`@matrix-org/matrix-sdk-crypto-wasm` does not run in React Native. Options:

- **A:** Vodozemac via Rust/JSI bindings.
- **B:** libolm native module.

Recommended sprint approach: ship baseline messaging first, then add E2EE.

## 5. Mobile App Structure (Expo Router)

```text
apps/mobile/app/
├── _layout.tsx
├── (auth)/
│   ├── login.tsx
│   └── register.tsx
├── (tabs)/
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── deepdive.tsx
│   ├── spaces.tsx
│   └── profile.tsx
├── room/
│   └── [roomId].tsx
├── room-info/
│   └── [roomId].tsx
└── governance/
    ├── proposals.tsx
    └── [proposalId].tsx
```

- Root layout should gate auth state.
- Tab layout should expose Messages, DeepDive, Spaces, Profile.

## 6. Build & Run Commands

### 6.1 Development

```bash
pnpm install
pnpm dev:mobile
pnpm dev:web
pnpm dev
```

### 6.2 Device Testing

Use Expo Go and scan QR from dev server on same network.

### 6.3 Production with EAS

Create `apps/mobile/eas.json` with `development`, `preview`, `production` profiles.

```bash
cd apps/mobile && eas build --platform ios --profile production
cd apps/mobile && eas build --platform android --profile production
eas submit --platform ios
eas submit --platform android
```

## 7. Push Notifications

Flow:

```text
Message → Synapse push rules → Sygnal → APNs/FCM → device notification
```

Client should request permissions, fetch push token, and register pusher on Matrix homeserver.

## 8. Three-Day Deployment Sprint

- **Day 1:** Monorepo setup, auth hook wiring, login verification.
- **Day 2:** Room list, timeline view, send text messages, DeepDive discovery.
- **Day 3:** Theming polish, push registration, EAS preview builds, device testing.

Defer for sprint: E2EE, voice/video, governance UX, steganography, desktop packaging.

## 9. Migrating from `Blackout_App` (Cinny Fork)

### Transfers directly to `packages/core`

- Matrix initialization/auth flows.
- State atoms and room/unread/settings logic.
- Custom governance/DeepDive event handlers.
- Room management utilities and push rule config.

### Requires rewrite for mobile

- React DOM UI + CSS.
- React Router navigation.
- IndexedDB/localStorage layers.
- Web editor/file APIs.

### Web-only holdovers

- Vanilla Extract theme files.
- Cinny fold components.
- Service worker / browser crypto / IndexedDB-specific code.

## 10. Post-Sprint Priority Order

1. E2EE integration (P0)
2. Media messages (P0)
3. Voice/video calling (P1)
4. Governance interactions (P1)
5. Tauri desktop wrapper (P1)
6. Steganography tiering (P2)
7. Ecosystem bridges (P2)
8. Blackbox provisioning image (P3)

---

**End of guide**
