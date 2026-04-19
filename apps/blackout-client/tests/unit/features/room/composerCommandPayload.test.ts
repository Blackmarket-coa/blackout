import { createEditor } from 'slate';
import { describe, expect, it, vi } from 'vitest';

import { invokeQuickAction } from '../../../../src/app/features/quick-actions/featureEntrypoints';
import {
    applyComposerPayloadToEditor,
    isComposerPayloadForRoom,
} from '../../../../src/app/features/room/composerCommandPayload';

vi.mock('../../../../src/app/components/editor', () => ({
    resetEditor: (editor: { children: unknown[] }) => {
        editor.children = [{ type: 'paragraph', children: [{ text: '' }] }];
    },
}));

describe('composer command payload integration', () => {
    it('inserts steganography quick action command into active room composer', () => {
        const queueCommand = vi.fn();
        invokeQuickAction('compose-steganography-layer', {
            openSettings: vi.fn(),
            openDevices: vi.fn(),
            toggleInbox: vi.fn(),
            openThreads: vi.fn(),
            openSearch: vi.fn(),
            openWidgetPanel: vi.fn(),
            queueCommand,
        });

        expect(queueCommand).toHaveBeenCalledWith('/steg-hide');

        const editor = createEditor();
        editor.children = [{ type: 'paragraph', children: [{ text: 'old text' }] }];

        const payload = {
            nonce: Date.now(),
            roomId: '!active:example.org',
            text: queueCommand.mock.calls[0][0],
        };

        expect(isComposerPayloadForRoom(payload, '!active:example.org')).toBe(true);

        applyComposerPayloadToEditor(editor, payload.text);

        expect((editor.children[0] as any).children[0].text).toBe('/steg-hide');
    });
});
