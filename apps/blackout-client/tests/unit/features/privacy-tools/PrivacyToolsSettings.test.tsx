// @vitest-environment jsdom
//
// The privacy tools panel said: "Image metadata (EXIF/GPS) stripping and link
// tracking-parameter removal are now always on". Neither was. It offered a
// paid "Warn when a file type can't be stripped" that nothing read, and
// "Perturb avatars against facial recognition", whose own code says it does
// not defeat current face recognition. docs/security/trust-claims-2026-11-16.md,
// T12.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';
import { PrivacyToolsSettings } from '../../../../src/app/features/privacy-tools/PrivacyToolsSettings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReactDOM.Root | null = null;
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
});

const render = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    await act(async () => {
        root?.render(
            <Provider store={createStore()}>
                <PrivacyToolsSettings />
            </Provider>
        );
    });
    return container;
};

describe('the privacy tools panel says what is done, and where', () => {
    it('does not call either protection "always on"', async () => {
        const container = await render();
        expect(container.textContent).not.toMatch(/always on/i);
    });

    it('says which pictures lose their metadata, and which do not', async () => {
        const text = (await render()).textContent ?? '';
        expect(text).toContain(
            'Before a picture leaves this device, this app removes its metadata, such as where and when it was taken, if it is a JPEG, PNG or WebP: pictures attached to messages, avatars, profile banners, listing photos, role icons and welcome images.'
        );
        expect(text).toContain(
            'Pictures in other formats (such as HEIC from an iPhone) and all videos are sent as they are, and the message box says so when you attach one. Emoji and stickers are uploaded as they are.'
        );
    });

    it('says where links lose their tracking parameters', async () => {
        const text = (await render()).textContent ?? '';
        expect(text).toContain(
            'Tracking parameters (utm_ tags, fbclid and the like) are removed from links in messages, forum posts and replies, and wall posts.'
        );
    });

    it('offers no warning option that nothing reads', async () => {
        const text = (await render()).textContent ?? '';
        expect(text).not.toMatch(/can.t be stripped/i);
        expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    });

    it('says the avatar pattern does not stop face recognition', async () => {
        const text = (await render()).textContent ?? '';
        expect(text).not.toMatch(/against facial recognition/i);
        expect(text).toContain(
            "Add a faint pattern to avatars (Advanced). It changes the picture's fingerprint; it does not stop current face recognition."
        );
    });
});
