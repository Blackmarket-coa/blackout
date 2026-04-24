# Core mobile surfaces (phase 1)

This workspace ships the first production-focused mobile surfaces backed by shared session/auth and native bridge hooks:

- Canopy list (workspace/channel index with unread counts).
- Channel/thread view.
- Posting composer (text + optional media IDs).
- Notifications inbox.
- Settings/profile.

These flows are represented by `MobileSurfaces` in `mobile/src/surfaces/mobile-surfaces.ts` and can be connected to React Native/Expo UI views in the host app.
