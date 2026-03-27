# Android Setup

1. Generate native project:
   ```bash
   cd blackout-mobile
   npx cap add android
   ```
2. Sync web assets and plugins:
   ```bash
   pnpm sync:android
   ```
3. Open in Android Studio:
   ```bash
   npx cap open android
   ```
4. Configure Firebase (`google-services.json`) for FCM.
5. Build via Gradle:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
