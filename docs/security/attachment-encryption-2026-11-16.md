# Files sent in encrypted rooms were not encrypted — 2026-11-16

Found while checking the trust page's sentences against the code
([`trust-claims-2026-11-16.md`](trust-claims-2026-11-16.md), finding T7).
Severity: the highest this project has. The app told people in an encrypted
room that "not even the server can" read what they sent there, and uploaded
every file they attached to that server as it was.

## Summary

| #   | What                                                                                                                 | Status                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A1  | Files, images, voice notes and hidden-message images sent in an encrypted room were unencrypted                      | Fixed for what is sent from now on. Files already sent: open. |
| A2  | The timeline could not open an encrypted file sent by any other Matrix app                                           | Fixed                                                         |
| A3  | A message sent before its room had loaded went out unencrypted (reachable from three places)                         | Fixed                                                         |
| A4  | A failed send showed nothing on screen                                                                               | Fixed                                                         |
| A5  | The composer's lock said the server could not read "these messages", with no exceptions                              | Fixed (copy)                                                  |
| A6  | Message search made blobs in the app's origin typed however the sender declared, HTML and SVG included               | Fixed                                                         |
| A7  | A file whose key travelled in an unencrypted message was labelled "Encrypted"                                        | Fixed                                                         |
| A8  | The timeline and member panels handed member- and sender-chosen addresses (avatars, video thumbnails) to the browser | Fixed there; profile card images open                         |
| A9  | A file attached in one room stayed attached when the person moved to another                                         | Fixed                                                         |
| A10 | Scheduling handed a message to the API without knowing whether its room was encrypted                                | Fixed                                                         |

Text messages were not affected by A1: the Matrix SDK encrypts every message
event in an encrypted room, and it did. What it does not do is encrypt a file
before upload. That is the app's job, and the app did not do it.

A1 to A5 were found and fixed first (`836d492075`). A6 to A10 came out of an
independent review of that change and are fixed in the commit that carries
this version of the record; the review is set out near the end.

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

The refusal is made in two places. The client itself refuses
(`refuseSendsToUnloadedRooms`, applied in `client/initMatrix.ts` where the
client is created), which covers every sender in the app: the SDK's
message-sending methods all go through the one function it wraps. The
composer's send hooks refuse as well. The first version of this fix had only
the hooks, and about twenty other places in the app call the client directly.

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
how a file gets into a room. `sendRoomAttachment`:

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

The rule is one function, `getBlobSafeMimeType` in `utils/mimeTypes.ts`. Its
list used to allow `text/html` and `application/xhtml+xml`, and the older
message components that message search still uses made their blobs with it,
or with no rule at all. It is now the narrow list, and those components go
through it too (R1 below).

Fetching is bounded. An encrypted image, sticker or voice note is fetched when
it has been on screen, and only if its message states a size of 20 MiB or
less; the same ceiling is enforced on the bytes that arrive
(`MediaFetchOptions.maxBytes` in `packages/blackout-sdk/src/client/media.ts`).
A message that understates its size is stopped at the ceiling: at once when
the server states a length, after up to 20 MiB has arrived when it does not.
It is then offered as a button that says it is larger than its message says.
Encrypted video and files are fetched only when the reader asks. A download
stops when its row leaves the screen. A load that fails can be tried again; it
starts over. The reader's "Disable Media Auto Load" setting switches unasked
fetching off altogether.

### What the reader is told

-   A file that was sent without encryption into an encrypted room now carries
    a line under it: "Not end-to-end encrypted: this file was sent without
    encryption, and the server can read it." That marks every file from A1 in
    every room's history, and any file a bridge or a not-yet-updated app sends
    from now on. Stickers are exempt: a sticker is a pack image referenced by
    address, and a pack is not private to a room.
-   A file can also be ciphertext on the server while the message carrying its
    key was not encrypted (a bot, a bridge, another app). The server then
    holds the key. Such a file is not labelled "Encrypted", and in an encrypted
    room it carries: "Not end-to-end encrypted: this file's key was sent in a
    message that was not encrypted, so the server can read the file." (A7. The
    first version labelled anything with a `file` field "Encrypted".)
-   The lock next to the composer now reads, in an encrypted room:
    "End-to-end encrypted. Messages and files you send here are encrypted on
    this device, and the server cannot read them. It can still see who is in
    the room, when things are sent and how large they are, emoji reactions, and
    anything kept as part of the room itself: its name and settings, den
    documents and proposals." (A5. Reactions are in that list because the SDK
    never encrypts them; documents and proposals because they are stored as
    room state, which Matrix never encrypts.)
-   A send that fails now says so under the composer (A4), and so does a forum
    post or reply. Before, the draft stayed and nothing was shown. Each part
    of a message now leaves the composer as it goes out (the text, then each
    file), so after a failure what is still in the box is what was not sent,
    and sending again does not repeat what was.

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
   bundle. The updated app marks what the old ones send. The other way round,
   an old build cannot open the encrypted files a new one sends (A2): it shows
   "Encrypted media not supported by current client runtime" until it is
   updated. That is also what a rollback of the client would do to files sent
   while the fix was live.
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
6. **Encrypted media is fetched from the homeserver's unauthenticated media
   address** (`/_matrix/media/v3/download`), like every other image in this
   timeline. This homeserver serves it. A homeserver that requires a login for
   media (matrix.org does) answers 404, so someone signed in to such a server
   through this app sees neither kind of media in this timeline. The older
   components, and the service worker, know the authenticated address; the
   timeline does not use them.
7. **The dead-drop banner.** `features/deaddrop/DeadDropComposer.tsx` wraps the
   same composer, so a file sent from it takes the path described here. Its
   banner said the message "will be queued". Nothing queued it: that is
   finding T8 of the trust-claims record, fixed in the commit after this one.

## Tests, and what each shows

Client unit tests, jsdom, with the real cipher (WebCrypto) throughout. Stood
in for: the network (the media client), the browser's object-URL registry, the
viewport observer and the file-save call. The composer's own tests stand in
for the send hooks, so the hidden-message path is covered by the test of
`sendRoomAttachment` and by the list of plain uploaders, not by a send through
the composer.

| File                                                                                                                                     | Shows                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/features/room/sendMediaEncryption.test.tsx`                                                                                  | In an encrypted room the upload is ciphertext with no name and no type, the message has `file` and no `url`, and the bytes decrypt to the original. OpenSSL (`node:crypto`) decrypts them too, with none of the app's code. Unknown room: nothing uploaded. Room turns encrypted, or leaves the store, during the upload: nothing sent |
| `tests/unit/features/rounds/voiceReplyEncryption.test.tsx`                                                                               | The same for a voice reply to a round                                                                                                                                                                                                                                                                                                  |
| `tests/unit/features/media/encryptedMedia.test.ts`                                                                                       | Tampered, swapped and truncated ciphertext are refused; a padded fingerprint is accepted; a file encrypted with OpenSSL from the specification opens; HTML, SVG, XML, script and PDF types become opaque                                                                                                                               |
| `tests/unit/components/messages/encryptedMediaRenderers.test.tsx`                                                                        | What each timeline component fetches and when; the blob type; the 20 MiB rule and the understated-size case; the auto-load setting; stopping when the row leaves; retry; no fallback to a plain `url` beside a `file`; the two notes and when "Encrypted" may be shown; that a sender-chosen thumbnail address is not loaded           |
| `tests/unit/utils/blobTypes.test.ts`                                                                                                     | The older components' two blob-making functions refuse document types (R1)                                                                                                                                                                                                                                                             |
| `tests/unit/sdk/mediaClientLimits.test.ts`                                                                                               | The byte ceiling stops on `Content-Length`, or at the chunk that crosses it; the abort signal reaches `fetch`                                                                                                                                                                                                                          |
| `tests/unit/features/room/unknownRoomSend.test.tsx`                                                                                      | A3: the SDK's plaintext send; the client-wide refusal, against the real SDK's send methods; the hooks' refusal                                                                                                                                                                                                                         |
| `tests/unit/client/initMatrix.tokenRefresh.test.ts`                                                                                      | The client a stored session starts carries the refusal                                                                                                                                                                                                                                                                                 |
| `tests/unit/features/media/directUploadCallers.test.ts`                                                                                  | The list of files that refer to a plain uploader is complete and current, read with the TypeScript parser                                                                                                                                                                                                                              |
| `tests/unit/features/room/MessageComposer.test.tsx`                                                                                      | The composer builds from the source it is given; the lock's text; the failure notices; scheduling refused for an unloaded or encrypted room; no empty message ahead of a file; nothing sent twice after a failure; a file does not follow the person to another room                                                                   |
| `tests/unit/features/forum/forumSendFailure.test.tsx`                                                                                    | A forum post that fails says why and keeps what was written                                                                                                                                                                                                                                                                            |
| `tests/unit/utils/media.test.ts`, `tests/unit/features/room/PinToggle.test.tsx`, `tests/unit/features/canopy/CanopyMemberPanel.test.tsx` | An avatar is loaded only from the homeserver (A8)                                                                                                                                                                                                                                                                                      |

Run on the code as it stands after the review's fixes: the client's
type-check and the SDK's pass; ESLint over the client source with CI's settings
passes; the client unit suite is 540 files, 4,024 tests passed and 3 skipped
(530 files and 3,816 passed before any of this); the smoke suite is 3 files,
13 tests; the production build succeeds; and the repository guards that read
the client pass (feature registry, feature budget, duplicate paths, room
encryption, trust page, SDK internal imports, protocol imports, legacy
isolation, legacy runtime imports, frontend consolidation).

Mutation checks, in a scratch copy: 59 changes to the client that each remove
or weaken one protection (upload the plaintext, send the file name, ignore the
crypto store, treat an unloaded room as unencrypted, skip the fingerprint
check, give a blob the sender's declared type, fall back to a plain `url`,
call a file encrypted when its key was sent in the clear, hand the browser a
sender-chosen address, let an attached file follow the person to another room,
and so on), and 7 to the SDK's media client. All 66 are caught by at least one
test. Three survived a first run over the two rounds. Each showed a test that
passed without checking what it named: a retry that was only tested where
another state change hid it, a room check that a second guard was masking, and
a typing failure injected on the wrong call. Each test was fixed and the
mutation run again.

`pnpm guard:no-direct-fetch-in-client-features` fails, as it does on
`develop`: it matches the word `fetch()` in a comment in
`features/coalitions/CampaignLandingPage.tsx`. No workflow runs it. Not
changed here.

## Independent review, and what was done

A second agent was given the code of `836d492075` and asked to find defects,
without this record's conclusions. It found no path that still puts a room
file's bytes, name or type on the server in the clear in an encrypted room.
It found the following around that. Each was checked here before it was acted
on; "probe" is something the reviewer ran, "test" something now in the suite.

**R1. Message search made blobs typed by the sender (A6). High. Fixed.**
Message search still renders media with the older components
(`components/message/content/`). `ImageContent`, `FileContent` and the
thumbnail gave a decrypted blob the sender's declared type as it was; video and
audio used a list that allowed `text/html` and `application/xhtml+xml`. A
sender could have an HTML or SVG blob made in the app's origin; opened in a
tab, its script runs with the app's session and keys. Nothing else stood in
the way in production, which serves no script-restricting policy (response
header of the client on 2026-11-16: `content-security-policy: frame-ancestors
'none'`). `tests/unit/utils/blobTypes.test.ts` failed 24 of 29 before the fix.
Fixed where those components make their blobs (`decryptFile` and
`downloadMedia` in `utils/matrix.ts`) and in the list itself
(`getBlobSafeMimeType`): raster image, audio and video types, nothing else.
This predates `836d492075`; it is the same rule that change introduced for the
timeline, applied to the code it had not touched.

**R2. "Encrypted" for a file whose key was sent in the clear (A7). High.
Fixed.** The first version called anything with a `file` field encrypted. See
"What the reader is told". Tests: the three components, both ways.

**R3. Scheduling skipped the room check (A10). Medium. Fixed.** The composer
held the room it found when it was mounted. Mounted before the room arrived,
it held "no room" for good, read that as "not encrypted", offered scheduled
send, and posted the text to the API, whose own refusal comes after it has the
text. The room is now read when it is used, and scheduling asks the same
question a file does: refused for a room that is not loaded, that is
encrypted, or that the crypto store remembers as encrypted.

**R4. The repository's nginx policy would block decrypted audio and video.
Medium. Not changed; stated.** `infra/nginx/snippets/security-headers.conf`
has no `media-src` and no `blob:` in `connect-src`. Under it a decrypted voice
note or video does not play, and the hidden-message panel cannot read back the
image it is given (the reviewer's probe, in Chrome). Production does not serve
that policy. The nginx files are not edited here: this repository's rule for
them is `nginx -t` and a header check per location on a running instance. What
changed: an audio or video the browser refuses now says so instead of showing a
dead player. A policy for the client needs `media-src 'self' blob:` and
`blob:` in `connect-src`; that is listed for the operator below.

**R5. The unloaded-room guard covered only the composer's hooks. Medium.
Fixed.** See A3: the client itself now refuses.

**R6. Encrypted media is fetched from the unauthenticated address. Medium.
Not fixed; stated.** See "What is not fixed", 6. A2 is fixed for this
homeserver, not for "any Matrix app on any server".

**R7. Unasked fetches ignored the auto-load setting and could not be stopped.
Fixed, in part.** The setting is honoured and a download stops when its row
leaves the screen. Not done: keeping a decrypted copy after its row is
unmounted. The timeline keeps a window of rows around the viewport; a row
that leaves it gives up its copy and fetches again when it comes back.

**R8. The list of what the server sees was incomplete. Fixed.** Den
documents, proposals, objectives, playbooks and role assignments are written
as room state (`packages/blackout-sdk/src/*/matrixActions.ts`,
`sendStateEvent`), and Matrix does not encrypt room state in any room. The
server also sees which earlier message a reply, an edit or a reaction points
to. `TRUST.md`, the composer's lock and `KNOWN_LIMITATIONS.md` now say so; it
is T9 in the trust-claims record.

**R9. Smaller findings.**

-   The test that lists plain uploaders read the source with patterns. Its
    comment-stripping removed real code between a string containing `/*`
    (`accept="image/*"`) and the next `*/`, 560 lines of one file among them,
    and it could not see `const up = uploadMedia`. It now uses the TypeScript
    parser and counts any use of either name; the scan has its own tests. The
    parser finds the same fourteen files.
-   Its reasons for the unmounted legacy input were wrong: that input encrypts
    attachments, but sends the file's type with the ciphertext and uploads a
    picked GIF unencrypted. Corrected; it must not be mounted as it is.
-   A forum post or reply that failed said nothing. Fixed.
-   A typing notice that failed after a successful schedule produced
    "Something was not sent". Fixed.
-   "Try again" was offered for a message with no usable key; a frame with
    neither placeholder nor image appeared when a fetch began; a reused
    component could show the previous message's media for one commit; the load
    button repeated a size the fetch had just found to be wrong; the notice for
    encryption turned on mid-upload said to attach the file again when it was
    still attached, and a second Send repeated what had already gone out; a
    file was saved under its caption when the message also carried a file
    name. All fixed; the loading state is now derived, not stored, and held
    with the message it belongs to.
-   Sentences in this record and in comments that said more than the code
    does. Corrected in place.

**R10. Suspected by the review.**

-   If a room left the store during an encrypted upload, the message, key
    included, could go out unencrypted. The room is now checked again before
    the message is sent, whichever way the upload went, and the client refuses
    as well. Test: `sendRoomAttachment` on its own.
-   A fingerprint written with base64 padding was read as tampering. Padding
    is now dropped before the comparison, which stays exact.
-   A room restored from this device's cache that was encrypted while the
    device was offline is treated as it was cached, until the sync arrives.
    Not fixable from the client: it decides from what it has synced.
-   `file-saver` in the desktop shell on macOS may navigate instead of saving.
    Not run; see "Not verified".

**Seen by the review in passing; older than this change.**

-   _A sender could learn who views a room (A8)._ The timeline used a video's
    `thumbnail_url` as its poster and a member's `avatar_url` as an image
    source, as they came. Either can be any `https://` address, and the
    browser fetches it: the address and the time of every viewer go to a
    server of the sender's choosing. The timeline now loads only what the
    homeserver holds (`avatarThumbnailUrl`, and `mxcToUrl` for the poster), and
    so do the two member panels that open a profile card. Checked and already
    sound: the forum, the members drawer and the reaction viewer, which
    convert the address through the SDK. Still open: the images a Blackout
    profile stores as plain addresses (avatar and banner on the profile card
    and page) and the marketplace producer's avatar address. T10 in the
    trust-claims record.
-   _A file attached in one room went with the person to the next (A9)._ The
    composer is one instance across rooms and kept its attachments. They are
    now dropped when the room changes.
-   _An empty text message went out ahead of every file sent with nothing
    typed._ Fixed.
-   _"View-once" media is never shown._ The gate counts the view when it
    mounts and hides the media in the same pass. Not fixed here; with the
    composer's other chips it is in the trust-claims record's list.

Removed while here: five unused components in `RoomTimeline.tsx` that handed a
message's raw `url` to the browser as an image, video, audio or link address.

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
5. **A content security policy for the client.** Production serves
   `frame-ancestors 'none'` and nothing else, so script injected into the page
   by any route would run unrestricted. The policy in
   `infra/nginx/snippets/security-headers.conf` is not what is served and would
   break media as it stands (R4). Adopting one is an infrastructure change
   with its own checks.

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
    the Tauri or Capacitor WebView; in a WebView that ignores the `download`
    attribute, `file-saver` falls back to navigating to the file.
-   **Playback under a content security policy.** Decrypted audio and video
    were not played under any policy. Production serves none that restricts
    media; the repository's nginx policy would block them (R4).
-   **Which media retention applies in production.**
    `infra/single-server-baseline/synapse/homeserver.yaml.template` removes
    local media not opened for 365 days;
    `deploy/docker/blackout-backend/synapse/homeserver.yaml.template` keeps it
    indefinitely. Which one the production host was built from was not read
    from the host.
-   **Since when, exactly.** See "How long".
