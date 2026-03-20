# Blackout Mobile Push Notifications (Sygnal + Matrix)

## Delivery path

1. `matrix-js-sdk` evaluates push rules for events.
2. Homeserver forwards notification payload to **Sygnal** push gateway.
3. Sygnal routes to:
   - **FCM** for Android devices.
   - **APNs** for iOS devices.
4. Capacitor Push Notifications plugin receives token + payload on device.
5. Token is published to Matrix pusher endpoint for the logged-in user/device.

## Server components

- Synapse with pushers enabled.
- Sygnal deployed alongside Synapse (same environment, low-latency path).
- Firebase project + service account for Android FCM.
- Apple Developer key/certificate + APNs topic for iOS.

## Client requirements

- Register device token using `@capacitor/push-notifications`.
- Store token per-device and refresh on rotation.
- Re-register token when account/device ID changes.
- Handle notification tap routing into `matrix://room/<roomId>` deep links.

## Security notes

- Keep FCM server key and APNs auth key in GitHub Actions secrets.
- Never embed provider secrets in the app bundle.
- Bind Matrix pusher registrations to authenticated user sessions only.
