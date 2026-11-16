// A file posted into a room must go through `sendRoomAttachment`, which
// encrypts it first when the room is encrypted. Until 2026-11-16 the composer
// called the plain uploader directly, and every attachment in every encrypted
// room reached the server unencrypted.
//
// This test lists every file that calls a plain uploader. A new caller fails
// it until someone adds the file here with the reason its upload is public, or
// moves it onto `sendRoomAttachment`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '../../../../src');

/** Calls that put bytes in the media repository as they are. */
const PLAIN_UPLOAD_CALL = /\b(?:uploadMedia|uploadContent)\s*\(/;

/**
 * Every file allowed to call a plain uploader, and why what it uploads is not
 * a private room file.
 */
const ALLOWED: Record<string, string> = {
    // The uploaders themselves.
    'app/utils/media.ts': 'defines uploadMedia',
    'app/utils/matrix.ts': 'defines uploadContent',
    'app/features/media/utils/matrixMedia.ts': 'defines uploadMedia',
    'app/features/media/utils/roomAttachment.ts':
        'the room sender: uploads ciphertext in encrypted rooms, plain only in unencrypted ones',

    // Public by design: shown to people outside any one room.
    'app/features/profile/ProfileEditor.tsx': 'profile avatar, public',
    'app/features/roles/RoleEditor.tsx': 'role icon, shown to the whole community',
    'app/features/welcome/WelcomeEditor.tsx': 'welcome-screen image, shown to every joiner',
    'app/features/creators/sell/MediaUploadField.tsx': 'marketplace listing images, public',
    'app/features/coalition/composer/VideoComposer.tsx': 'coalition feed video, a public post',
    'app/features/coliseum/tabs/DebateTab.tsx': 'debate argument video, a public post',
    'app/features/streaming/composer/ClipComposer.tsx': 'stream clip, a public post',
    'app/state/upload.ts':
        'upload atoms for avatars and image packs; the old room input that also used them encrypts first',

    // The pre-rewrite room input, imported by nothing that is mounted. It
    // encrypts with encryptFile before it uploads.
    'app/features/room/RoomInput.tsx': 'unmounted legacy input; encrypts before upload',
    'app/features/room/msgContent.ts': 'unmounted legacy thumbnails; encrypted by its caller',
};

const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
            walk(full, out);
        } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
            out.push(full);
        }
    }
    return out;
};

const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const callers = walk(srcRoot)
    .filter((file) => PLAIN_UPLOAD_CALL.test(stripComments(readFileSync(file, 'utf8'))))
    .map((file) => path.relative(srcRoot, file).split(path.sep).join('/'))
    .sort();

describe('plain uploads to the media repository', () => {
    it('are made only by the files listed, each with a reason', () => {
        const unexpected = callers.filter((file) => !(file in ALLOWED));
        expect(
            unexpected,
            'These files upload without encryption. Send room files with sendRoomAttachment, or list the file in this test with the reason its upload is public.'
        ).toEqual([]);
    });

    it('the list has no entry for a file that no longer uploads', () => {
        const stale = Object.keys(ALLOWED).filter((file) => !callers.includes(file));
        expect(stale).toEqual([]);
    });

    it('the composer, the send hooks and round replies are not on it', () => {
        for (const file of [
            'app/features/room/MessageComposer.tsx',
            'app/plugins/matrix-adapters/hooks/useLegacyTimelineAdapter.ts',
            'app/hooks/useTimeline.ts',
            'app/features/rounds/useRounds.ts',
        ]) {
            expect(callers, file).not.toContain(file);
            expect(readFileSync(path.join(srcRoot, file), 'utf8'), file).toContain(
                'sendRoomAttachment('
            );
        }
    });
});
