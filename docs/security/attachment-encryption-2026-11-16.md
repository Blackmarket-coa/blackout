# Files sent in encrypted rooms were not encrypted — 2026-11-16

Found while checking the trust page's sentences against the code
([`trust-claims-2026-11-16.md`](trust-claims-2026-11-16.md), finding T7).
Severity: the highest this project has. The app told people in an encrypted
room that "not even the server can" read what they sent there, and uploaded
every file they attached to that server as it was.

## Summary

| #   | What                                                                                            | Status                                                        |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A1  | Files, images, voice notes and hidden-message images sent in an encrypted room were unencrypted | Fixed for what is sent from now on. Files already sent: open. |
| A2  | The timeline could not open an encrypted file sent by any other Matrix app                      | Fixed                                                         |
| A3  | A message sent before its room had loaded went out unencrypted (reachable from three places)    | Fixed                                                         |
| A4  | A failed send showed nothing on screen                                                          | Fixed                                                         |
| A5  | The composer's lock said the server could not read "these messages", with no exceptions         | Fixed (copy)                                                  |

Text messages were not affected by A1: the Matrix SDK encrypts every message
event in an encrypted room, and it did. What it does not do is encrypt a file
before upload. That is the app's job, and the app did not do it.

## A1. What was wrong

A file attached in the composer went through one function,
`useLegacySendMessageAdapter().sendMedia`
(`apps/blackout-client/src/app/plugins/matrix-adapters/hooks/useLegacyTimelineAdapter.ts`).
It called `uploadMedia(client, file)`, which is

```ts
mx.uploadContent(file, { includeFilename: true, name: file.name, type: file.type });
```

and then sent a message whose content held the returned address in `url`. The
room's encryption was never consulted. Four paths did this:

-   attachments of any kind (button, paste, drag and drop);
-   voice notes;
-   images carrying a hidden message (the steganography feature), which called
    `uploadMedia` itself;
-   voice replies to a round (`features/rounds/useRounds.ts`).

In an encrypted room the _message_ was encrypted, so the address of the file
was hidden inside it. The _file_ was not: the upload request carried the
file's bytes, its name (as `?filename=`) and its type to the media repository.

Reproduced before anything was changed:
`tests/unit/features/room/sendMediaEncryption.test.tsx` run against `develop`
at `4e46da0cf7` failed 7 of 8, the first with the attached file's text found
in the bytes handed to the upload call in an encrypted room.

### What the server holds for each such file

The bytes; the original file name; the declared type; the size; the account
that uploaded it; when; and, for images, any thumbnails Synapse made from
them. It cannot read from the encrypted message which room the file belongs
to, but the uploader and the time of the upload narrow that to few rooms.

### Who could read the files

-   Whoever runs the homeserver, and anyone with access to its disk, its
    database or its backups.
-   The homeserver of any member of the room who is on another server and
    opened the file: that server fetched its own copy.
-   Anyone holding the file's address. This Synapse version (1.98) serves
    media without asking who is asking: there is no `enable_authenticated_media`
    in `apps/blackout-server/synapse/config/` and no
    `/_matrix/client/v1/media` route. The address has a random identifier and
    was inside the encrypted message, so in practice this means the room's
    members and whoever they passed it to.

Not: someone watching the network. The upload and every download are over TLS.

### How long

The function has uploaded this way since the commit that created its file,
`8725c3172c` on 2026-04-13 (read on GitHub; this checkout's own history starts
on 2026-10-09). Whether the composer on screen used that function from that
date, or an older input that encrypted, was not established. The honest
reading for anyone deciding what to do about their own files is: every file
sent from the Blackout app into an encrypted room before the build that
carries this fix.

## A2. Encrypted files from other apps could not be opened

The timeline's media components
(`apps/blackout-client/src/app/components/messages/`) fetched an encrypted
file and then called `client.decryptMedia`. No such method exists in
`matrix-js-sdk` 40.2.0 (zero occurrences in its `lib/`), so every encrypted
image, video, voice note or file sent by Element or any other Matrix app ended
in "Encrypted media not supported by current client runtime". Between two
people using Blackout this never showed, because the app never sent an
encrypted file.

## A3. A message to a room that has not loaded

Found while fixing A1. The SDK decides whether to encrypt from the room object
it holds, and for a room it does not hold it sends the event as it is
(`encryptEventIfNeeded`: "If the room is unknown, we cannot encrypt for it").

Observed with the real SDK and a recorded request, not inferred:
`tests/unit/features/room/unknownRoomSend.test.tsx`, first test. The request
is `PUT …/send/m.room.message/…` with the message body readable. The five
hook cases in that file failed before the guard and pass with it.

How exposed the app was is narrower than "any room". The main room view, the
`/embed` panel and the canopy den surface show the composer only once the room
is loaded and joined (`RoomInviteAcceptGate`, the joined-room list, a non-null
`room`). Three places do not: the coalition chat tab
(`features/coalition/tabs/ChatTab.tsx`) and the two Coliseum discussion
mounts (`EntryDiscussionSheet.tsx`, `DiscussionSection.tsx`) take a room id
from the API and mount the composer at once. In those, a member of an
encrypted room who typed and sent before the first sync had delivered that
room would have sent plaintext. Someone who is not a member is refused by the
server (403), so nothing of theirs is stored.

Whether that ever happened is not known and cannot be recovered from the
client. A homeserver operator can count it: plaintext `m.room.message` events
in rooms that have an `m.room.encryption` event.

## What changed

### Sending

`apps/blackout-client/src/app/features/media/utils/roomAttachment.ts` is now
the only way a file gets into a room. `sendRoomAttachment`:

1. Asks whether the room is encrypted, by the SDK's own rule for events: the
   room's state says so, **or** the crypto store remembers that it did. The
   second half is what refuses a homeserver that stops serving the room's
   encryption event.
2. Refuses a room the client has not loaded. Nothing is uploaded.
3. In an encrypted room, encrypts the file in the client (AES-256-CTR, a fresh
   key and IV per file, Matrix encrypted-attachment format v2) and uploads the
   ciphertext as `application/octet-stream` with no file name. The key, IV and
   SHA-256 of the ciphertext go in the message's `file` field, which the SDK
   encrypts with the rest of the event. The message carries no `url`.
4. Asks again after the upload. If encryption was turned on while a plain
   upload was in flight, the message is not sent, and the composer says that
   an unencrypted copy reached the server and that the app cannot delete it.

The composer's three paths, the round replies and an unused duplicate hook
(`hooks/useTimeline.ts`) all call it. The content builders
(`attachmentContent.ts`, `voiceMessage.ts`) take the upload's `source`
(`{ url }` or `{ file }`) instead of a URL, so a builder cannot write a plain
`url` onto an encrypted file.

`tests/unit/features/media/directUploadCallers.test.ts` lists every file in
the client that calls a plain uploader, each with the reason what it uploads is
public (avatars, role icons, marketplace images, feed and debate videos,
clips). A new caller fails that test until it is listed with a reason or moved
onto `sendRoomAttachment`.

### Opening

`apps/blackout-client/src/app/features/media/utils/encryptedMedia.ts` fetches
the ciphertext, checks its SHA-256 against the one in the message, and only
then decrypts. A file that was changed, swapped or truncated on the server is
not opened, and the timeline says why.

A decrypted file is a blob in the app's own origin. If a browser rendered one
as a page (HTML, SVG, XML), the script in it would run with the app's session
and keys. So:

-   a blob shown inline gets the sender's declared type only when that type is
    on a list of raster image, audio and video types; anything else becomes
    `application/octet-stream`, which a browser saves and does not render;
-   a file saved with Download is always `application/octet-stream`, whatever
    the sender declared;
-   an encrypted PDF gets no inline preview.

The existing `getBlobSafeMimeType` in `utils/mimeTypes.ts` was not used for
this: its list allows `text/html` and `application/xhtml+xml`.

Fetching is bounded. An encrypted image, sticker or voice note is fetched when
it has been on screen, and only if its message states a size of 20 MiB or
less; the same ceiling is enforced on the bytes that arrive
(`MediaFetchLimits.maxBytes` in `packages/blackout-sdk/src/client/media.ts`),
so a message that understates its size is stopped there and offered as a
button, not downloaded. Encrypted video and files are fetched only when the
reader asks. A load that fails can be tried again from where it failed.

### What the reader is told

-   A file that was sent without encryption into an encrypted room now carries
    a line under it: "Not end-to-end encrypted: this file was sent without
    encryption, and the server can read it." That marks every file from A1 in
    every room's history, and any file a bridge or a not-yet-updated app sends
    from now on. Stickers are exempt: a sticker is a pack image referenced by
    address, and a pack is not private to a room.
-   The lock next to the composer now reads, in an encrypted room:
    "End-to-end encrypted. Messages and files you send here are encrypted on
    this device, and the server cannot read them. It can still see the room's
    name and members, when things are sent and how large they are, and emoji
    reactions." (A5. Reactions are in that list because the SDK never encrypts
    them.)
-   A send that fails now says so under the composer (A4). Before, the draft
    stayed and nothing was shown.

## What is not fixed

1. **Files already sent are still on the server, unencrypted.** The app cannot
   delete them: Matrix gives a client no call for deleting media, and deleting
   ("redacting") the message does not remove the file. Copies fetched by other
   homeservers are outside this server's reach altogether. See the first
   decision below.
2. **Apps built before this change keep uploading unencrypted** until they are
   updated. The desktop and mobile shells bundle the client
   (`blackout-desktop/src-tauri/tauri.conf.json`, `blackout-mobile/capacitor.config.ts`),
   so they need new builds; a browser tab needs a reload that picks up the new
   bundle. The updated app marks what the old ones send.
3. **The server still learns, for an encrypted file:** its size to the byte
   (CTR mode adds no padding), who uploaded it and when, and the network
   addresses it is downloaded from (downloads need no login, so it sees
   addresses, not accounts). From the timing it can usually tell which room.
4. **Sending still reads the whole file into memory** to encrypt it, and
   opening holds the ciphertext and the plaintext at once. The server's upload
   limit (100 MB in the two deploy templates) is the ceiling.
5. **No thumbnails for encrypted images.** The full image is fetched. Encrypted
   video is downloaded whole before it plays. No inline preview for encrypted
   PDFs.
6. **A send that fails part-way** (text sent, attachment refused) leaves the
   text in the composer, as before. The new notice says "Something was not
   sent" and to check the conversation; it does not clear what did go out.
7. **The dead-drop banner.** `features/deaddrop/DeadDropComposer.tsx` wraps the
   same composer, so a file sent from it takes the path described here. Its
   banner says the message "will be queued"; whether anything queues it is a
   separate claim, not checked in this change and carried to the trust-claims
   record's next findings.

## Tests, and what each shows

Client unit tests, jsdom, with the real cipher (WebCrypto) throughout; only
the network and the browser's object-URL registry are stood in for.

| File                                                              | Shows                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/unit/features/room/sendMediaEncryption.test.tsx`           | In an encrypted room the upload is ciphertext with no name and no type, the message has `file` and no `url`, and the bytes decrypt to the original. OpenSSL (`node:crypto`) decrypts them too, with none of the app's code. Unknown room: nothing uploaded. Race: nothing sent |
| `tests/unit/features/rounds/voiceReplyEncryption.test.tsx`        | The same for a voice reply to a round                                                                                                                                                                                                                                          |
| `tests/unit/features/media/encryptedMedia.test.ts`                | Tampered, swapped and truncated ciphertext are refused; a file encrypted with OpenSSL from the specification opens; HTML, SVG, XML, script and PDF types become opaque                                                                                                         |
| `tests/unit/components/messages/encryptedMediaRenderers.test.tsx` | What each timeline component fetches and when; the blob type; the 20 MiB rule and the understated-size case; no fallback to a plain `url` beside a `file`; the unencrypted-file note                                                                                           |
| `tests/unit/sdk/mediaClientLimits.test.ts`                        | The byte ceiling stops on `Content-Length`, or at the chunk that crosses it                                                                                                                                                                                                    |
| `tests/unit/features/room/unknownRoomSend.test.tsx`               | A3: the SDK's plaintext send, and the hooks' refusal                                                                                                                                                                                                                           |
| `tests/unit/features/media/directUploadCallers.test.ts`           | The list of plain uploaders is complete and current                                                                                                                                                                                                                            |
| `tests/unit/features/room/MessageComposer.test.tsx`               | The composer builds from the source it is given; the lock's text; the failure notices                                                                                                                                                                                          |

Run on the change as committed: the client's type-check and the SDK's pass;
ESLint over the client source with CI's settings passes; the client unit suite
is 537 files, 3,921 tests passed and 3 skipped (530 files and 3,816 passed
before this change); the smoke suite is 3 files, 13 tests; the production
build succeeds; and the repository guards that read the client pass (feature
registry, feature budget, duplicate paths, room encryption, trust page, SDK
internal imports, protocol imports, legacy isolation, legacy runtime imports,
frontend consolidation).

Mutation checks, in a scratch copy: 36 changes to the client that each remove
or weaken one protection (upload the plaintext, send the file name, ignore the
crypto store, treat an unloaded room as unencrypted, skip the fingerprint
check, give a blob the sender's declared type, fall back to a plain `url`,
drop the byte ceiling, fetch video unasked, and so on), and 5 to the SDK's
byte ceiling. All 41 are caught by at least one test. One survived the first
run (retrying a load the reader had asked for); the test it showed to be
missing was added.

`pnpm guard:no-direct-fetch-in-client-features` fails, as it does on
`develop`: it matches the word `fetch()` in a comment in
`features/coalitions/CampaignLandingPage.tsx`. No workflow runs it. Not
changed here.

An independent review of the code was requested. It had not reported when
this was committed; its findings, and what was done about each, are added to
this record in the commit that follows.

## Decisions for the operator

1. **The files already on the server.** Three courses, none without cost:
    - _Leave them and say so._ What this change does: the trust page and the
      limitations list state it, and each file is marked in the timeline.
    - _Tell the people affected directly_ (a notice in the app, or a message
      from the operator), so that anyone who sent something that matters can
      act on it: rotate what the file disclosed, or ask for it to be removed.
      This pass recommends it. The people this app is for may have sent
      documents on the strength of "not even the server can".
    - _Delete them from the server._ Synapse's admin API can delete local media
      by identifier or by date. The server cannot tell an attachment from an
      encrypted room apart from other uploads by reading messages; it can list
      local media that no unencrypted event, profile or room state refers to,
      which is those attachments plus anything orphaned. Deleting them removes
      the files for the people in those rooms too, and does nothing about
      copies on other homeservers or in backups.
2. **Backups.** A backup of the media store taken before the fix holds the
   same files. Whether to expire those backups early is the operator's call.
3. **Counting A3.** Whether to query the homeserver for plaintext messages in
   encrypted rooms, to learn whether the window in A3 was ever hit.
4. **Authenticated media.** Media on this homeserver is served to anyone who
   has the address. Newer Synapse versions can require a login. That is an
   upstream port (`apps/blackout-server/PATCHES.md`), not part of this change.

## Not verified

-   **The deployed build.** The finding is in the code on `develop`. That
    production serves that code was not checked: no test account was used
    against production, and no test file was sent to it.
-   **A real browser, and a real homeserver.** The unit tests run on Node's
    WebCrypto in jsdom. Beyond them, the two modules were bundled as they are
    and run in Chromium 153 (headless) against a stand-in media repository
    that stored what it was sent, from a harness kept outside the repository.
    Observed there: the upload from an encrypted room arrived as
    `application/octet-stream`, with no `filename`, and was not a PNG; the
    decrypted blob loaded in an `<img>` at the original 37×23; a byte flipped
    by the server was refused; the byte ceiling stopped a chunked response;
    and an "image" that was really an HTML page did not run its script when
    its blob had the opaque type, while the same bytes under the declared
    `text/html` did, which is the case the type rule exists for. Not done: the
    app itself, signed in, against a real Synapse.
-   **Another Matrix app.** Interoperability was checked against an independent
    implementation of the cipher (OpenSSL), in both directions, not against
    Element or any other client.
-   **The desktop and mobile shells.** Download of a decrypted file uses
    `file-saver`, as the recovery-key download already does. It was not run in
    the Tauri or Capacitor WebView.
-   **Which media retention applies in production.**
    `infra/single-server-baseline/synapse/homeserver.yaml.template` removes
    local media not opened for 365 days;
    `deploy/docker/blackout-backend/synapse/homeserver.yaml.template` keeps it
    indefinitely. Which one the production host was built from was not read
    from the host.
-   **Since when, exactly.** See "How long".
