// A file posted into a room must go through `sendRoomAttachment`, which
// encrypts it first when the room is encrypted. Until 2026-11-16 the composer
// called the plain uploader directly, and every attachment in every encrypted
// room reached the server unencrypted.
//
// This test lists every file that refers to a plain uploader. A new one fails
// it until someone adds the file here with the reason its upload is public, or
// moves it onto `sendRoomAttachment`.
//
// The source is read with the TypeScript parser, not with patterns: a pattern
// that strips comments also strips real code between a string holding the two
// characters that open a comment (`accept="image/*"`) and the next place a
// comment closes, and a pattern for calls misses `const up = uploadMedia`.
// Any use of the name counts: a call, an import, an alias, a property.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '../../../../src');

/** The functions that put bytes in the media repository as they are. */
const PLAIN_UPLOADERS = new Set(['uploadMedia', 'uploadContent']);

/** Whether a source text uses either name as an identifier, anywhere. */
const refersToPlainUploader = (fileName: string, text: string): boolean => {
    const source = ts.createSourceFile(
        fileName,
        text,
        ts.ScriptTarget.Latest,
        false,
        fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    let found = false;
    const visit = (node: ts.Node): void => {
        if (found) return;
        if (ts.isIdentifier(node) && PLAIN_UPLOADERS.has(node.text)) {
            found = true;
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
};

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

    // The pre-rewrite room input, imported by nothing that is mounted. It is
    // not safe to mount as it is: it encrypts attachments before upload, but
    // sends the file's type with the ciphertext, and uploads a picked GIF
    // unencrypted into any room.
    'app/features/room/RoomInput.tsx':
        'unmounted legacy input; must go through sendRoomAttachment before it is mounted',
    'app/features/room/msgContent.ts':
        'unmounted legacy thumbnails; uploads what its caller hands it, encrypted or not',
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

const callers = walk(srcRoot)
    .filter((file) => refersToPlainUploader(file, readFileSync(file, 'utf8')))
    .map((file) => path.relative(srcRoot, file).split(path.sep).join('/'))
    .sort();

describe('the scan itself', () => {
    it.each([
        ['a call', 'export const f = (mx: any, file: File) => uploadMedia(mx, file);'],
        ['a method call', 'export const f = (mx: any, file: File) => mx.uploadContent(file);'],
        ['an alias', 'const up = uploadMedia;\nexport const f = (mx: any, f: File) => up(mx, f);'],
        ['an import', "import { uploadMedia as send } from './media';\nexport const f = send;"],
        [
            'a call after a string that looks like the start of a comment',
            'const accept = "image/*";\nexport const f = (mx: any, x: File) => mx.uploadContent(x); /* end */',
        ],
    ])('sees %s', (_what, text) => {
        expect(refersToPlainUploader('sample.ts', text)).toBe(true);
    });

    it.each([
        ['a comment', '// uploadMedia(mx, file) used to be called here\nexport const f = 1;'],
        ['a string', 'export const label = "uploadContent(file)";'],
        ['another name', 'export const f = (mx: any, file: File) => mx.uploadContentSafely(file);'],
    ])('is not set off by %s', (_what, text) => {
        expect(refersToPlainUploader('sample.ts', text)).toBe(false);
    });
});

describe('plain uploads to the media repository', () => {
    it('are referred to only by the files listed, each with a reason', () => {
        const unexpected = callers.filter((file) => !(file in ALLOWED));
        expect(
            unexpected,
            'These files refer to a plain uploader. Send room files with sendRoomAttachment, or list the file in this test with the reason its upload is public.'
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
