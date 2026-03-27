/*
Copyright 2024 New Vector Ltd.
Copyright 2017 Aviral Dasgupta

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { clamp } from "lodash";
import { type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { type SerializedPart } from "./editor/parts";
import type EditorModel from "./editor/model";

interface IHistoryItem {
    parts: SerializedPart[];
    replyEventId?: string;
}

const LAST_INDEX_STORAGE_KEY = "[last]";

export default class SendHistoryManager {
    public history: Array<IHistoryItem> = [];
    public prefix: string;
    public lastIndex = 0; // used for indexing the storage
    public currentIndex = 0; // used for indexing the loaded validated history Array

    public constructor(roomId: string, prefix: string) {
        this.prefix = prefix + roomId;

        let itemJSON: string | null;
        const storedLastIndex = Number.parseInt(
            sessionStorage.getItem(`${this.prefix}${LAST_INDEX_STORAGE_KEY}`) ?? "",
            10,
        );

        if (Number.isInteger(storedLastIndex) && storedLastIndex >= 0) {
            for (let index = 0; index <= storedLastIndex; index++) {
                itemJSON = sessionStorage.getItem(`${this.prefix}[${index}]`);
                if (!itemJSON) break;
                try {
                    this.history.push(JSON.parse(itemJSON));
                } catch (e) {
                    logger.warn("Throwing away unserialisable history", e);
                    break;
                }
            }
        } else {
            let index = 0;
            while ((itemJSON = sessionStorage.getItem(`${this.prefix}[${index}]`))) {
                try {
                    this.history.push(JSON.parse(itemJSON));
                } catch (e) {
                    logger.warn("Throwing away unserialisable history", e);
                    break;
                }
                ++index;
            }
        }
        this.lastIndex = this.history.length - 1;
        // reset currentIndex to account for any unserialisable history
        this.currentIndex = this.lastIndex + 1;
    }

    public static createItem(model: EditorModel, replyEvent?: MatrixEvent): IHistoryItem {
        return {
            parts: model.serializeParts(),
            replyEventId: replyEvent ? replyEvent.getId() : undefined,
        };
    }

    public save(editorModel: EditorModel, replyEvent?: MatrixEvent): void {
        const item = SendHistoryManager.createItem(editorModel, replyEvent);
        this.history.push(item);
        this.currentIndex = this.history.length;
        this.lastIndex += 1;
        sessionStorage.setItem(`${this.prefix}[${this.lastIndex}]`, JSON.stringify(item));
        sessionStorage.setItem(`${this.prefix}${LAST_INDEX_STORAGE_KEY}`, this.lastIndex.toString());
    }

    public getItem(offset: number): IHistoryItem {
        this.currentIndex = clamp(this.currentIndex + offset, 0, this.history.length - 1);
        return this.history[this.currentIndex];
    }
}
