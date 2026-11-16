// @vitest-environment jsdom
//
// The privacy tools said image metadata stripping was "always on". It ran on
// pictures attached in the message box and on avatars, and not on a profile
// banner, a marketplace listing photo, a role icon or a welcome-screen image:
// each was uploaded as it was picked, with whatever it recorded, which for a
// photo from a phone can be where it was taken. All four are public.
// docs/security/trust-claims-2026-11-16.md, T12.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore } from 'jotai';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
    uploadContent: vi.fn(
        async (_mx: unknown, _file: File, opts: { onSuccess: (m: string) => void }) =>
            opts.onSuccess('mxc://hs.example/listing1')
    ),
    uploadMedia: vi.fn(async () => 'mxc://hs.example/banner1'),
}));

// The stripper is replaced by one that renames what it returns, so a test can
// tell which file reached the uploader.
vi.mock('../../../../src/app/utils/stripImageMetadata', () => ({
    stripImageMetadata: vi.fn(
        async (f: File) => new File([f], `clean-${f.name}`, { type: f.type })
    ),
    keepsMetadata: () => false,
}));
vi.mock('../../../../src/app/utils/matrix', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    uploadContent: mocks.uploadContent,
    mxcUrlToHttp: (_mx: unknown, mxc: string) =>
        `https://hs.example/_matrix/media/v3/download/${mxc.slice('mxc://'.length)}`,
}));
vi.mock('../../../../src/app/utils/media', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    uploadMedia: mocks.uploadMedia,
}));
vi.mock('../../../../src/app/hooks/useMediaAuthentication', () => ({
    useMediaAuthentication: () => false,
}));
vi.mock('../../../../src/app/features/profile/customStatus', () => ({
    syncStatusToPresence: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../src/app/features/profile/profileClient', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    fetchProfilePalettes: vi.fn().mockResolvedValue({ stats: {}, palettes: [] }),
}));

const client = {
    getUserId: () => '@owner:hs.example',
    getHomeserverUrl: () => 'https://hs.example',
};
vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => client,
    useMatrixClientOrNull: () => client,
}));

import { MediaUploadField } from '../../../../src/app/features/creators/sell/MediaUploadField';
import { ProfileEditor } from '../../../../src/app/features/profile/ProfileEditor';
import { myProfileAtom } from '../../../../src/app/features/profile/profileAtoms';

const roots: ReactDOM.Root[] = [];
afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

const mount = async (node: React.ReactNode, store = createStore()) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    roots.push(root);
    await act(async () => {
        root.render(<Provider store={store}>{node}</Provider>);
    });
    return container;
};

const pick = async (input: HTMLInputElement, file: File) => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

describe('a public picture is uploaded with its metadata removed', () => {
    it('a marketplace listing photo', async () => {
        const container = await mount(<MediaUploadField value={[]} onChange={vi.fn()} />);
        const input = container.querySelector(
            '[data-testid="media-upload-input"]'
        ) as HTMLInputElement;
        await pick(input, new File(['x'], 'product.jpg', { type: 'image/jpeg' }));

        expect(mocks.uploadContent).toHaveBeenCalledTimes(1);
        expect((mocks.uploadContent.mock.calls[0][1] as File).name).toBe('clean-product.jpg');
    });

    it('a profile banner', async () => {
        const store = createStore();
        store.set(myProfileAtom, {
            userId: '@owner:hs.example',
            displayName: 'Owner',
            roleBadges: [],
            mutualSpaces: [],
            profile: {},
        });
        const container = await mount(
            <ProfileEditor saveProfile={vi.fn().mockResolvedValue({})} />,
            store
        );
        const section = [...container.querySelectorAll('section')].find((el) =>
            el.textContent?.includes('Banner upload')
        ) as HTMLElement;
        const input = section.querySelector('input[type="file"]') as HTMLInputElement;
        await pick(input, new File(['x'], 'view-from-home.jpg', { type: 'image/jpeg' }));

        expect(mocks.uploadMedia).toHaveBeenCalledTimes(1);
        expect((mocks.uploadMedia.mock.calls[0][1] as File).name).toBe('clean-view-from-home.jpg');
    });
});

// The role icon and the welcome image are uploaded by a small function inside
// a large editor. What matters is that the value handed to the uploader is the
// one the stripper returned; that is checked on the parsed source.
describe('the role icon and the welcome image upload what the stripper returned', () => {
    const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../src');

    /**
     * Every value passed first to an `.uploadContent(...)` call, and the
     * function whose awaited result it was declared from, looked up in the
     * function that makes the call.
     */
    const uploadedValues = (rel: string) => {
        const file = path.join(srcRoot, rel);
        const source = ts.createSourceFile(
            file,
            readFileSync(file, 'utf8'),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX
        );
        const enclosingFunction = (node: ts.Node): ts.Node => {
            let current = node.parent;
            while (current && !ts.isFunctionLike(current)) current = current.parent;
            return current ?? source;
        };
        const declaredFrom = (scope: ts.Node, name: string): string | null => {
            let found: string | null = null;
            const visit = (node: ts.Node) => {
                if (
                    ts.isVariableDeclaration(node) &&
                    ts.isIdentifier(node.name) &&
                    node.name.text === name &&
                    enclosingFunction(node) === scope
                ) {
                    const init = node.initializer;
                    found =
                        init && ts.isAwaitExpression(init) && ts.isCallExpression(init.expression)
                            ? init.expression.expression.getText(source)
                            : init?.getText(source) ?? '';
                }
                ts.forEachChild(node, visit);
            };
            visit(scope);
            return found;
        };
        const uploads: Array<{ name: string; from: string | null }> = [];
        const visit = (node: ts.Node) => {
            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression) &&
                node.expression.name.text === 'uploadContent'
            ) {
                const name = node.arguments[0]?.getText(source) ?? '';
                uploads.push({ name, from: declaredFrom(enclosingFunction(node), name) });
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
        return uploads;
    };

    it.each([['app/features/roles/RoleEditor.tsx'], ['app/features/welcome/WelcomeEditor.tsx']])(
        '%s',
        (rel) => {
            const uploads = uploadedValues(rel);
            expect(uploads.length).toBeGreaterThan(0);
            for (const upload of uploads) {
                expect(upload.from, `${rel} uploads ${upload.name}`).toBe('stripImageMetadata');
            }
        }
    );
});
