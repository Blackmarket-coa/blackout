# iOS Setup

1. Generate native project:
   ```bash
   cd blackout-mobile
   npx cap add ios
   ```
2. Sync web assets and plugins:
   ```bash
   pnpm sync:ios
   ```
3. Open in Xcode:
   ```bash
   npx cap open ios
   ```
4. Configure APNs capability and bundle signing in Xcode.
5. Use Fastlane lanes in `ios/fastlane/Fastfile` for beta/release uploads.
