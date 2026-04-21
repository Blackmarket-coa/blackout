import { Editor, Transforms } from 'slate';

import type { ComposerCommandPayload } from '../../state/bmc-composer';
import { resetEditor } from '../../components/editor';

export const isComposerPayloadForRoom = (
    payload: ComposerCommandPayload,
    roomId: string,
): boolean => !payload.roomId || payload.roomId === roomId;

export const applyComposerPayloadToEditor = (editor: Editor, text: string) => {
    resetEditor(editor);
    Transforms.insertText(editor, text);
};
