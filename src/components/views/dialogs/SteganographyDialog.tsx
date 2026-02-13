/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useState, useCallback } from "react";
import { type MatrixEvent } from "matrix-js-sdk/src/matrix";

import BaseDialog from "./BaseDialog";
import DialogButtons from "../elements/DialogButtons";
import { _t } from "../../../languageHandler";
import {
    encodeSteganographyMessage,
    decodeSteganographyMessage,
    containsSteganographyMessage,
} from "../../../utils/Steganography";
import dis from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { TimelineRenderingType } from "../../../contexts/RoomContext";

type Mode = "encode" | "decode";

interface IProps {
    mxEvent?: MatrixEvent;
    onFinished(): void;
}

/**
 * Dialog for creating or reading steganography messages hidden within
 * visible message text using zero-width Unicode characters.
 * Supports optional AES-GCM encryption via passphrase.
 */
export default function SteganographyDialog({ mxEvent, onFinished }: IProps): JSX.Element {
    const encryptionAvailable = Boolean(globalThis.crypto?.subtle);
    const messageBody = mxEvent?.getContent().body || "";
    const hasHidden = containsSteganographyMessage(messageBody);
    const canDecode = Boolean(mxEvent);

    const [mode, setMode] = useState<Mode>(canDecode && hasHidden ? "decode" : "encode");
    const [secretMessage, setSecretMessage] = useState("");
    const [coverText, setCoverText] = useState("");
    const [passphrase, setPassphrase] = useState("");
    const [useEncryption, setUseEncryption] = useState(encryptionAvailable);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);

    const onEncode = useCallback(async () => {
        if (!coverText.trim()) {
            setError(_t("steganography|error_no_cover_text"));
            return;
        }
        if (!secretMessage.trim()) {
            setError(_t("steganography|error_no_secret"));
            return;
        }

        if (useEncryption && !encryptionAvailable) {
            setError(_t("steganography|error_encryption_unavailable"));
            return;
        }

        setProcessing(true);
        setError(null);
        try {
            const encoded = await encodeSteganographyMessage(
                coverText,
                secretMessage,
                useEncryption && passphrase ? passphrase : undefined,
            );
            setResult(encoded);
        } catch {
            setError(_t("steganography|error_encoding"));
        } finally {
            setProcessing(false);
        }
    }, [coverText, encryptionAvailable, secretMessage, passphrase, useEncryption]);

    const onDecode = useCallback(async () => {
        setProcessing(true);
        setError(null);
        try {
            const decoded = await decodeSteganographyMessage(messageBody, passphrase || undefined);
            if (decoded === null) {
                setError(_t("steganography|error_no_hidden_message"));
            } else {
                setResult(decoded);
            }
        } catch {
            setError(_t("steganography|error_decoding"));
        } finally {
            setProcessing(false);
        }
    }, [messageBody, passphrase]);

    const onSendEncoded = useCallback(() => {
        if (!result) return;
        dis.dispatch({
            action: Action.ComposerInsert,
            text: result,
            timelineRenderingType: TimelineRenderingType.Room,
        });
        onFinished();
    }, [result, onFinished]);

    const onCopyResult = useCallback(() => {
        if (!result) return;
        navigator.clipboard.writeText(result);
    }, [result]);

    return (
        <BaseDialog
            title={_t("steganography|title")}
            className="mx_SteganographyDialog"
            contentId="mx_Dialog_content"
            onFinished={onFinished}
            fixedWidth={true}
        >
            <div className="mx_Dialog_content" id="mx_Dialog_content">
                {/* Mode toggle */}
                {canDecode && (
                    <div className="mx_SteganographyDialog_modeToggle">
                        <button
                            type="button"
                            className={`mx_SteganographyDialog_modeButton ${mode === "encode" ? "mx_SteganographyDialog_modeButton--active" : ""}`}
                            onClick={() => {
                                setMode("encode");
                                setResult(null);
                                setError(null);
                            }}
                        >
                            {_t("steganography|mode_encode")}
                        </button>
                        <button
                            type="button"
                            className={`mx_SteganographyDialog_modeButton ${mode === "decode" ? "mx_SteganographyDialog_modeButton--active" : ""}`}
                            onClick={() => {
                                setMode("decode");
                                setResult(null);
                                setError(null);
                            }}
                        >
                            {_t("steganography|mode_decode")}
                        </button>
                    </div>
                )}

                <p className="mx_SteganographyDialog_description">
                    {mode === "encode"
                        ? _t("steganography|description_encode")
                        : _t("steganography|description_decode")}
                </p>

                {mode === "encode" && (
                    <>
                        <div className="mx_SteganographyDialog_field">
                            <label htmlFor="mx_SteganographyDialog_coverText">
                                {_t("steganography|cover_text_label")}
                            </label>
                            <textarea
                                id="mx_SteganographyDialog_coverText"
                                value={coverText}
                                onChange={(e) => setCoverText(e.target.value)}
                                placeholder={_t("steganography|cover_text_placeholder")}
                                rows={3}
                            />
                        </div>
                        <div className="mx_SteganographyDialog_field">
                            <label htmlFor="mx_SteganographyDialog_secret">
                                {_t("steganography|secret_message_label")}
                            </label>
                            <textarea
                                id="mx_SteganographyDialog_secret"
                                value={secretMessage}
                                onChange={(e) => setSecretMessage(e.target.value)}
                                placeholder={_t("steganography|secret_message_placeholder")}
                                rows={3}
                            />
                        </div>
                    </>
                )}

                {mode === "decode" && (
                    <div className="mx_SteganographyDialog_field">
                        <label>{_t("steganography|source_message_label")}</label>
                        <div className="mx_SteganographyDialog_sourcePreview">
                            {messageBody.length > 200 ? messageBody.slice(0, 200) + "..." : messageBody}
                        </div>
                        {hasHidden && (
                            <p className="mx_SteganographyDialog_hint">{_t("steganography|hidden_message_detected")}</p>
                        )}
                    </div>
                )}

                {/* Encryption options */}
                <div className="mx_SteganographyDialog_encryption">
                    {mode === "encode" && (
                        <label className="mx_SteganographyDialog_checkboxLabel">
                            <input
                                type="checkbox"
                                checked={useEncryption}
                                disabled={!encryptionAvailable}
                                onChange={(e) => setUseEncryption(e.target.checked)}
                            />
                            {_t("steganography|use_encryption")}
                        </label>
                    )}
                    {mode === "encode" && !encryptionAvailable && (
                        <p className="mx_SteganographyDialog_hint">{_t("steganography|encryption_unavailable_hint")}</p>
                    )}
                    {(mode === "decode" || useEncryption) && (
                        <div className="mx_SteganographyDialog_field">
                            <label htmlFor="mx_SteganographyDialog_passphrase">
                                {_t("steganography|passphrase_label")}
                            </label>
                            <input
                                id="mx_SteganographyDialog_passphrase"
                                type="password"
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                placeholder={_t("steganography|passphrase_placeholder")}
                                autoComplete="off"
                            />
                        </div>
                    )}
                </div>

                {error && <p className="mx_SteganographyDialog_error">{error}</p>}

                {result && (
                    <div className="mx_SteganographyDialog_result">
                        <label>
                            {mode === "encode"
                                ? _t("steganography|result_encoded")
                                : _t("steganography|result_decoded")}
                        </label>
                        <div className="mx_SteganographyDialog_resultContent">{result}</div>
                        {mode === "encode" && (
                            <div className="mx_SteganographyDialog_resultActions">
                                <button type="button" onClick={onSendEncoded} className="mx_Dialog_primary">
                                    {_t("steganography|insert_into_composer")}
                                </button>
                                <button type="button" onClick={onCopyResult}>
                                    {_t("action|copy")}
                                </button>
                            </div>
                        )}
                        {mode === "decode" && (
                            <div className="mx_SteganographyDialog_resultActions">
                                <button type="button" onClick={onCopyResult}>
                                    {_t("action|copy")}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <DialogButtons
                primaryButton={
                    processing
                        ? _t("steganography|processing")
                        : mode === "encode"
                          ? _t("steganography|encode_button")
                          : _t("steganography|decode_button")
                }
                onPrimaryButtonClick={mode === "encode" ? onEncode : onDecode}
                primaryDisabled={processing}
                onCancel={onFinished}
            />
        </BaseDialog>
    );
}
