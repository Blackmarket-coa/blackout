# End to end encryption by default

By default, Element will create encrypted DM rooms if the user you are chatting with has keys uploaded on their account.
For private room creation, Element will default to encryption on but give you the choice to opt-out.

## Disabling encryption by default

Set the following on your homeserver's
`/.well-known/matrix/client` config:

```json
{
    "io.element.e2ee": {
        "default": false
    }
}
```

## Disabling encryption

Set the following on your homeserver's
`/.well-known/matrix/client` config:

```json
{
    "io.element.e2ee": {
        "force_disable": true
    }
}
```

When `force_disable` is true:

-   all rooms will be created with encryption disabled, and it will not be possible to enable
    encryption from room settings.
-   any `io.element.e2ee.default` value will be disregarded.

Note: If the server is configured to forcibly enable encryption for some or all rooms,
this behaviour will be overridden.

# Setting up recovery

By default, Element strongly encourages (but does not require) users to set up
recovery so that you can access history on your new devices as well as retain access to your message history and cryptographic identity when you lose all of your devices.

## Blackout: no setup gate is enforced

`apps/blackout-client/src/app/features/settings/security/encryptionPosture.ts`
defines an onboarding gate, `onboardingBlocked(posture, policy)`. Its default
policy, `DEFAULT_ONBOARDING_POLICY`, is `{ requireCrossSigning: true }`, and
the gate checks only whether this device's cross-signing is ready
(`crossSigningReady`), not recovery or a key backup. Nothing in the client
calls it, so Blackout does not require recovery, a key backup or
cross-signing before anyone sends a message.

What Blackout does show is the key-backup nudge. It offers the from-scratch
setup only when the homeserver answers that the account has neither a key
backup nor cross-signing, and the warned reset only when this device trusts
the account's cross-signing and the account has no backup; otherwise it
explains what it found. Blackout has no screen that restores keys from a
backup. See `docs/security/key-backup-nudge-2026-11-02.md`.

## Removal of old settings

Support for the configuration options `secure_backup_required` and `secure_backup_setup_methods`
in the `/.well-known/matrix/client` config has been removed.

Setting up recovery is now always recommended to all users by showing a one-off toast and a
permanent red dot on the _Encryption_ tab in the _Settings_ dialog. When creating a new
recovery key, the UI only supports auto-generated keys. Using an existing (custom) passphrase
still works, but is not exposed in the UI when setting up recovery.

That paragraph describes Element. Blackout has no _Encryption_ tab, toast or red dot; its
prompt is the key-backup nudge described above.

# Compatibility

The settings above were first proposed under a `im.vector.riot.e2ee` key, which
is now deprecated. Element will check for either key, preferring
`io.element.e2ee` if both exist.
