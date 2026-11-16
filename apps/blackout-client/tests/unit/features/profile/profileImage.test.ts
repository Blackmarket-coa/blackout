// A profile's avatar and banner are stored as addresses, and the profile API
// accepts any URL for them. Until 2026-11-16 the profile card, the profile
// window and the profile page handed the stored address to an <img> as it
// was, so the owner of a profile could point it at a server of their own and
// learn who opened the profile, from which network address, and when.
//
// `profileImageSrc` is the rule that replaced that: only media the homeserver
// serves is loaded.
import { describe, expect, it } from 'vitest';
import { profileImageSrc } from '../../../../src/app/features/profile/profileImage';

const HS = 'https://hs.example';

describe('profileImageSrc: what is loaded', () => {
    it('an mxc:// address, from this homeserver', () => {
        expect(profileImageSrc('mxc://hs.example/abc123', HS)).toBe(
            'https://hs.example/_matrix/media/v3/download/hs.example/abc123'
        );
    });

    it('an mxc:// address on another server, still through this homeserver', () => {
        expect(profileImageSrc('mxc://elsewhere.example/xyz', HS)).toBe(
            'https://hs.example/_matrix/media/v3/download/elsewhere.example/xyz'
        );
    });

    it.each([
        // What the editor stores for an avatar and for a banner.
        'https://hs.example/_matrix/media/v3/thumbnail/hs.example/abc?width=160&height=160&method=crop',
        'https://hs.example/_matrix/media/v3/download/hs.example/abc',
        // An address an older client stored, on the r0 path.
        'https://hs.example/_matrix/media/r0/download/hs.example/abc',
        // The same two on a homeserver that serves authenticated media.
        'https://hs.example/_matrix/client/v1/media/thumbnail/hs.example/abc?width=160&height=160&method=crop',
        'https://hs.example/_matrix/client/v1/media/download/hs.example/abc',
    ])('the homeserver address the editor stores: %s', (address) => {
        expect(profileImageSrc(address, HS)).toBe(address);
    });

    it('the same when the homeserver address is written with a trailing slash', () => {
        const address = 'https://hs.example/_matrix/media/v3/download/hs.example/abc';
        expect(profileImageSrc(address, 'https://hs.example/')).toBe(address);
    });

    it('media under the base path of a homeserver that is served from one', () => {
        const address = 'https://example.org/matrix/_matrix/media/v3/download/example.org/abc';
        expect(profileImageSrc(address, 'https://example.org/matrix')).toBe(address);
        expect(profileImageSrc('mxc://example.org/abc', 'https://example.org/matrix/')).toBe(
            address
        );
        // The media path of the bare host is not that homeserver's.
        expect(
            profileImageSrc(
                'https://example.org/_matrix/media/v3/download/example.org/abc',
                'https://example.org/matrix'
            )
        ).toBeNull();
        // Nor is one under another directory of the same length.
        expect(
            profileImageSrc(
                'https://example.org/abcdef/_matrix/media/v3/download/example.org/abc',
                'https://example.org/matrix'
            )
        ).toBeNull();
    });

    it("the editor's local preview, which reaches no network", () => {
        const preview = 'blob:https://app.example/0f8fad5b-d9cb-469f-a165-70867728950e';
        expect(profileImageSrc(preview, HS)).toBe(preview);
        // The preview is shown before anything is known about a homeserver.
        expect(profileImageSrc(preview, '')).toBe(preview);
    });
});

describe('profileImageSrc: what is not', () => {
    it.each([
        ['an address on another server', 'https://tracker.example/pixel.gif?who=reader'],
        ['a plain-http address on another server', 'http://tracker.example/pixel.gif'],
        [
            'another server, written to look like the homeserver',
            'https://hs.example.tracker.example/_matrix/media/v3/download/hs.example/abc',
        ],
        [
            'another server, with the homeserver as a user name',
            'https://hs.example@tracker.example/_matrix/media/v3/download/hs.example/abc',
        ],
        [
            'another server, with the homeserver as a user name and a port',
            'https://hs.example:443@tracker.example/_matrix/media/v3/download/hs.example/abc',
        ],
        ['the homeserver on another port', 'https://hs.example:8448/_matrix/media/v3/download/a/b'],
        ['the homeserver over plain http', 'http://hs.example/_matrix/media/v3/download/a/b'],
        ['a protocol-relative address', '//tracker.example/pixel.gif'],
        ['a data: address', 'data:image/svg+xml;base64,PHN2Zy8+'],
        ['a javascript: address', 'javascript:alert(1)'],
        ['a relative address', '/_matrix/media/v3/download/hs.example/abc'],
        ['a bare word', 'avatar.png'],
        ['an empty string', ''],
    ])('%s', (_what, address) => {
        expect(profileImageSrc(address, HS)).toBeNull();
    });

    it.each([
        [
            'a path on the homeserver that is not media',
            'https://hs.example/_matrix/client/v3/logout',
        ],
        ['the homeserver root', 'https://hs.example/'],
        [
            'a media path that climbs out of the media paths',
            'https://hs.example/_matrix/media/../../_synapse/admin/v1/users',
        ],
        [
            'the same climb, percent-encoded',
            'https://hs.example/_matrix/media/%2e%2e/%2e%2e/_synapse/admin/v1/users',
        ],
        ['a path that only begins like the media path', 'https://hs.example/_matrix/mediax/a'],
        [
            "the media API's link preview, which makes the homeserver fetch an address",
            'https://hs.example/_matrix/media/v3/preview_url?url=https%3A%2F%2Ftracker.example%2F',
        ],
        [
            'the same on the authenticated media path',
            'https://hs.example/_matrix/client/v1/media/preview_url?url=https%3A%2F%2Ftracker.example%2F',
        ],
        ['another media endpoint', 'https://hs.example/_matrix/media/v3/config'],
        [
            'a download address that climbs out to the link preview',
            'https://hs.example/_matrix/media/v3/download/../preview_url?url=https%3A%2F%2Ftracker.example%2F',
        ],
        [
            'a download endpoint with nothing after it',
            'https://hs.example/_matrix/media/v3/download',
        ],
    ])('%s', (_what, address) => {
        expect(profileImageSrc(address, HS)).toBeNull();
    });

    it('an mxc:// address whose media id climbs out of the media paths', () => {
        expect(
            profileImageSrc('mxc://hs.example/../../../../_synapse/admin/v1/users', HS)
        ).toBeNull();
    });

    it('an mxc:// address with no media id', () => {
        expect(profileImageSrc('mxc://hs.example', HS)).toBeNull();
        expect(profileImageSrc('mxc://', HS)).toBeNull();
    });

    it.each([
        [undefined],
        [null],
        [42],
        [{ url: 'mxc://hs.example/abc' }],
        [['mxc://hs.example/abc']],
    ])('a value that is not text: %j', (value) => {
        expect(profileImageSrc(value, HS)).toBeNull();
    });

    it('anything but a local preview when the homeserver is not known', () => {
        expect(profileImageSrc('mxc://hs.example/abc', '')).toBeNull();
        expect(
            profileImageSrc('https://hs.example/_matrix/media/v3/download/hs.example/abc', '')
        ).toBeNull();
    });

    it('a homeserver address that is not a web address lets nothing through', () => {
        expect(profileImageSrc('data:image/png;base64,AAAA', 'data:text/plain,x')).toBeNull();
        expect(profileImageSrc('file:///_matrix/media/v3/download/a/b', 'file:///')).toBeNull();
        expect(profileImageSrc('mxc://hs.example/abc', 'not a url')).toBeNull();
    });

    it('returns the address in the form that was checked', () => {
        // Leading space and an upper-case host: the browser would request the
        // normalised form, so that is what is checked and what is returned.
        expect(
            profileImageSrc(' HTTPS://HS.EXAMPLE/_matrix/media/v3/download/hs.example/abc', HS)
        ).toBe('https://hs.example/_matrix/media/v3/download/hs.example/abc');
    });
});
