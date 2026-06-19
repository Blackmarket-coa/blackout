# Android build notes

- Target package: `co.bmc.blackout` (must match `capacitor.config.ts` `appId` and the iOS bundle id)
- Signing should be supplied from CI secrets (`ANDROID_UPLOAD_KEYSTORE_B64`, alias, passwords)
- Upload artifacts to Play Console internal/beta track for staged rollout
