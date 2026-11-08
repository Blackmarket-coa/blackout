import React, { FormEventHandler, forwardRef, useCallback, useState } from 'react';
import {
    Dialog,
    Header,
    Box,
    Text,
    IconButton,
    Icon,
    Icons,
    config,
    Button,
    Chip,
    color,
    Spinner,
} from 'folds';
import FileSaver from 'file-saver';
import to from 'await-to-js';
import { AuthDict, IAuthData, MatrixError, UIAuthCallback } from 'matrix-js-sdk';
import type { GeneratedSecretStorageKey } from 'matrix-js-sdk/lib/crypto-api';
import { PasswordInput } from './password-input';
import { ContainerColor } from '../styles/ContainerColor.css';
import { copyToClipboard } from '../utils/dom';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { clearSecretStorageKeys } from '../../client/secretStorageKeys';
import {
    SETUP_CONFIRM_CANCELLED_TEXT,
    SETUP_PARTWAY_TEXT,
    checkAccountKeyState,
    checkBackupState,
    setupRefusal,
    type SetupMode,
    type SetupPartwayStage,
} from '../../client/keyBackupCheck';
import { ActionUIA, ActionUIAFlowsLoader } from './ActionUIA';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useAlive } from '../hooks/useAlive';
import { UseStateProvider } from './UseStateProvider';

type UIACallback<T> = (
    authDict: AuthDict | null
) => Promise<[IAuthData, undefined] | [undefined, T]>;

type PerformAction<T> = (authDict: AuthDict | null) => Promise<T>;

type UIAAction<T> = {
    authData: IAuthData;
    callback: UIACallback<T>;
    cancelCallback: (error?: unknown) => void;
};

function makeUIAAction<T>(
    authData: IAuthData,
    performAction: PerformAction<T>,
    resolve: (data: T) => void,
    reject: (error?: any) => void
): UIAAction<T> {
    const action: UIAAction<T> = {
        authData,
        callback: async (authDict) => {
            const [error, data] = await to<T, MatrixError | Error>(performAction(authDict));

            if (error instanceof MatrixError && error.httpStatus === 401) {
                return [error.data as IAuthData, undefined];
            }

            if (error) {
                reject(error);
                throw error;
            }

            resolve(data);
            return [undefined, data];
        },
        cancelCallback: reject,
    };

    return action;
}

/**
 * The cross-signing an earlier attempt of this form uploaded: its master
 * public key, and whether that attempt's cross-signing step finished (the
 * keys and this device's signature uploaded).
 */
type OwnCrossSigning = { masterKey: string; complete: boolean };

/**
 * An attempt failed, or its account confirmation was cancelled, after it had
 * started writing the account's secret storage. `stage` says where.
 */
class SetupStoppedPartway extends Error {
    constructor(message: string, readonly stage: SetupPartwayStage) {
        super(message);
    }
}

/** The person closed the account confirmation the cross-signing upload asked for. */
class SetupConfirmCancelled extends Error {
    constructor() {
        super(SETUP_CONFIRM_CANCELLED_TEXT);
    }
}

/** The line to show for a failure: its message, or a fixed line when it has none. */
const failureText = (error: unknown): string =>
    error instanceof Error && error.message ? error.message : 'Unexpected Error!';

/**
 * The recovery key of an attempt that stopped partway (`SetupStoppedPartway`),
 * kept on screen and used again by the next Continue, and where that attempt
 * stopped.
 */
type HeldRecoveryKey = { key: GeneratedSecretStorageKey; stage: SetupPartwayStage };

type SetupVerificationProps = {
    onComplete: (recoveryKey: string) => void;
    /**
     * `'setup'` (default): the from-scratch flow, which goes on only when the
     * homeserver answers that the account has neither a backup nor
     * cross-signing. `'reset'`: the warned flow, which replaces cross-signing
     * on purpose but still never deletes a backup (see `setupRefusal`).
     */
    mode?: SetupMode;
};
export function SetupVerification({ onComplete, mode = 'setup' }: SetupVerificationProps) {
    const mx = useMatrixClient();
    const alive = useAlive();

    const [uiaAction, setUIAAction] = useState<UIAAction<void>>();
    const [nextAuthData, setNextAuthData] = useState<IAuthData | null>(); // null means no next action.
    const [ownCrossSigning, setOwnCrossSigning] = useState<OwnCrossSigning | null>(null);
    const [heldKey, setHeldKey] = useState<HeldRecoveryKey | null>(null);

    const handleAction = useCallback(
        async (authDict: AuthDict) => {
            if (!uiaAction) {
                throw new Error('Unexpected Error! UIA action is perform without data.');
            }
            if (alive()) {
                setNextAuthData(null);
            }
            const [authData] = await uiaAction.callback(authDict);

            if (alive() && authData) {
                setNextAuthData(authData);
            }
        },
        [uiaAction, alive]
    );

    const resetUIA = useCallback(() => {
        if (!alive()) return;
        setUIAAction(undefined);
        setNextAuthData(undefined);
    }, [alive]);

    const authUploadDeviceSigningKeys: UIAuthCallback<void> = useCallback(
        (makeRequest) =>
            new Promise<void>((resolve, reject) => {
                makeRequest(null)
                    .then(() => {
                        resolve();
                        resetUIA();
                    })
                    .catch((error) => {
                        if (error instanceof MatrixError && error.httpStatus === 401) {
                            const authData = error.data as IAuthData;
                            const action = makeUIAAction(
                                authData,
                                makeRequest as PerformAction<void>,
                                resolve,
                                (err) => {
                                    resetUIA();
                                    reject(err);
                                }
                            );
                            if (alive()) {
                                setUIAAction(action);
                            } else {
                                reject(
                                    new Error(
                                        'Authentication failed! Failed to setup device verification.'
                                    )
                                );
                            }
                            return;
                        }
                        reject(error);
                    });
            }),
        [alive, resetUIA]
    );

    const [setupState, setup] = useAsyncCallback<void, Error, [string | undefined]>(
        useCallback(
            async (passphrase) => {
                const crypto = mx.getCrypto();
                if (!crypto) throw new Error('Unexpected Error! Crypto module not found!');

                // The last check before anything is written (S9,
                // docs/security/key-backup-nudge-2026-11-02.md). Every entry
                // re-checked at its click; this closes the window between that
                // click and this submit, in which another device of the
                // account may have created cross-signing and a backup. What
                // follows replaces the account's secret storage and
                // cross-signing and deletes every backup version it has, so
                // only the homeserver's fresh answer lets it go on.
                //
                // An earlier attempt of this same form may have uploaded
                // cross-signing and then failed at a later step (the backup's
                // creation, say). The account then has a master key, which is
                // this form's own: the check lets the form go on when the
                // homeserver's master key is that one and there is no backup,
                // and the form keeps that identity rather than make another,
                // provided the earlier attempt's cross-signing step finished.
                const state = await checkAccountKeyState(mx);
                const refusal = setupRefusal(state, mode, ownCrossSigning?.masterKey);
                if (refusal) throw new Error(refusal);
                const keepOwnCrossSigning =
                    ownCrossSigning !== null &&
                    ownCrossSigning.complete &&
                    state.crossSigning === 'yes' &&
                    state.masterKey === ownCrossSigning.masterKey;

                // After an attempt that stopped partway, the account's secret
                // storage may open only with that attempt's recovery key, which
                // the form shows; the next attempt uses the same key, so the
                // key on screen stays the one that opens it.
                const recoveryKeyData =
                    heldKey?.key ?? (await crypto.createRecoveryKeyFromPassphrase(passphrase));
                const { encodedPrivateKey } = recoveryKeyData;
                if (!encodedPrivateKey) {
                    throw new Error('Unexpected Error! Failed to create recovery key.');
                }
                clearSecretStorageKeys();

                let step: 'secret_storage' | 'cross_signing' | 'backup' = 'secret_storage';
                try {
                    // With the form's own cross-signing kept, this also
                    // stores those keys under the new recovery key: this
                    // device holds them, and the storage is new.
                    await crypto.bootstrapSecretStorage({
                        createSecretStorageKey: async () => recoveryKeyData,
                        setupNewSecretStorage: true,
                    });

                    step = 'cross_signing';
                    if (!keepOwnCrossSigning) {
                        let complete = false;
                        try {
                            await crypto.bootstrapCrossSigning({
                                authUploadDeviceSigningKeys,
                                setupNewCrossSigning: true,
                            });
                            complete = true;
                        } finally {
                            // The master key this attempt made, whether or not
                            // its upload got through: the next attempt goes on
                            // past the check only if the homeserver holds it.
                            const masterKey = await crypto.getCrossSigningKeyId().catch(() => null);
                            if (alive()) {
                                setOwnCrossSigning(masterKey ? { masterKey, complete } : null);
                            }
                        }
                    }

                    step = 'backup';
                    await crypto.resetKeyBackup();
                } catch (error) {
                    // From the first write on, the account's secret storage may
                    // open only with this attempt's recovery key (S9, sixth
                    // review): show it, say how far the attempt got, and offer
                    // Continue only where the next attempt can finish.
                    let stage: SetupPartwayStage;
                    if (step === 'backup') {
                        // `resetKeyBackup` creates the backup before it stores
                        // the backup's key, so ask whether one exists now. Only
                        // a 404 M_NOT_FOUND means none.
                        const { backup } = await checkBackupState(mx);
                        stage = backup === 'none' ? 'backup_none' : 'backup_unclear';
                    } else {
                        stage = step;
                    }
                    if (alive()) setHeldKey({ key: recoveryKeyData, stage });
                    throw new SetupStoppedPartway(failureText(error), stage);
                }

                onComplete(encodedPrivateKey);
            },
            [mx, mode, onComplete, authUploadDeviceSigningKeys, ownCrossSigning, heldKey, alive]
        )
    );

    const loading = setupState.status === AsyncStatus.Loading;
    const latestError = setupState.status === AsyncStatus.Error ? setupState.error : undefined;
    const partwayNext =
        latestError instanceof SetupStoppedPartway
            ? SETUP_PARTWAY_TEXT[latestError.stage].next
            : undefined;
    const offerContinue = !heldKey || SETUP_PARTWAY_TEXT[heldKey.stage].next !== undefined;

    const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
        evt.preventDefault();
        // No Continue is offered after a backup this attempt may have created
        // (`SETUP_PARTWAY_TEXT.backup_unclear`); a submit by other means does
        // nothing either.
        if (loading || !offerContinue) return;

        const target = evt.target as HTMLFormElement | undefined;
        const passphraseInput = target?.passphraseInput as HTMLInputElement | undefined;
        let passphrase: string | undefined;
        if (passphraseInput && passphraseInput.value.length > 0) {
            passphrase = passphraseInput.value;
        }

        // useAsyncCallback records a failure in `setupState`, which the form
        // shows below, and then rethrows it; a refusal from the account check
        // is an expected outcome, not an escape, so the rejection ends here.
        void setup(passphrase).catch(() => undefined);
    };

    return (
        <Box direction="Column" gap="400">
            {/* Outside the form: its buttons are not submit buttons. */}
            {heldKey?.key.encodedPrivateKey && (
                <RecoveryKeyDisplay
                    recoveryKey={heldKey.key.encodedPrivateKey}
                    lead={SETUP_PARTWAY_TEXT[heldKey.stage].what}
                />
            )}
            <Box as="form" onSubmit={handleSubmit} direction="Column" gap="400">
                {!heldKey && (
                    <>
                        <Text size="T300">
                            Generate a <b>Recovery Key</b> for verifying identity if you do not have
                            access to other devices. Additionally, setup a passphrase as a memorable
                            alternative.
                        </Text>
                        <Box direction="Column" gap="100">
                            <Text size="L400">Passphrase (Optional)</Text>
                            <PasswordInput name="passphraseInput" size="400" readOnly={loading} />
                        </Box>
                    </>
                )}
                {offerContinue && (
                    <Button
                        type="submit"
                        disabled={loading}
                        before={loading && <Spinner size="200" variant="Primary" fill="Solid" />}
                    >
                        <Text size="B400">Continue</Text>
                    </Button>
                )}
                {latestError !== undefined && (
                    <Text size="T200" style={{ color: color.Critical.Main }}>
                        <b>{failureText(latestError)}</b>
                    </Text>
                )}
                {partwayNext && <Text size="T200">{partwayNext}</Text>}
                {nextAuthData !== null && uiaAction && (
                    <ActionUIAFlowsLoader
                        authData={nextAuthData ?? uiaAction.authData}
                        unsupported={() => (
                            <Text size="T200">
                                Authentication steps to perform this action are not supported by
                                client.
                            </Text>
                        )}
                    >
                        {(ongoingFlow) => (
                            <ActionUIA
                                authData={nextAuthData ?? uiaAction.authData}
                                ongoingFlow={ongoingFlow}
                                action={handleAction}
                                onCancel={() =>
                                    uiaAction.cancelCallback(new SetupConfirmCancelled())
                                }
                            />
                        )}
                    </ActionUIAFlowsLoader>
                )}
            </Box>
        </Box>
    );
}

type RecoveryKeyDisplayProps = {
    recoveryKey: string;
    /** The sentence above the key; the setup form passes its partway text. */
    lead?: string;
};
export function RecoveryKeyDisplay({ recoveryKey, lead }: RecoveryKeyDisplayProps) {
    const [show, setShow] = useState(false);

    const handleCopy = () => {
        copyToClipboard(recoveryKey);
    };

    const handleDownload = () => {
        const blob = new Blob([recoveryKey], {
            type: 'text/plain;charset=us-ascii',
        });
        FileSaver.saveAs(blob, 'recovery-key.txt');
    };

    const safeToDisplayKey = show ? recoveryKey : recoveryKey.replace(/[^\s]/g, '*');

    return (
        <Box direction="Column" gap="400">
            <Text size="T300">
                {lead ??
                    'Store the Recovery Key in a safe place for future use, as you will need it to verify your identity if you do not have access to other devices.'}
            </Text>
            <Box direction="Column" gap="100">
                <Text size="L400">Recovery Key</Text>
                <Box
                    className={ContainerColor({ variant: 'SurfaceVariant' })}
                    style={{
                        padding: config.space.S300,
                        borderRadius: config.radii.R400,
                    }}
                    alignItems="Center"
                    justifyContent="Center"
                    gap="400"
                >
                    <Text style={{ fontFamily: 'monospace' }} size="T200" priority="300">
                        {safeToDisplayKey}
                    </Text>
                    <Chip
                        type="button"
                        onClick={() => setShow(!show)}
                        variant="Secondary"
                        radii="Pill"
                    >
                        <Text size="B300">{show ? 'Hide' : 'Show'}</Text>
                    </Chip>
                </Box>
            </Box>
            <Box direction="Column" gap="200">
                <Button type="button" onClick={handleCopy}>
                    <Text size="B400">Copy</Text>
                </Button>
                <Button type="button" onClick={handleDownload} fill="Soft">
                    <Text size="B400">Download</Text>
                </Button>
            </Box>
        </Box>
    );
}

type DeviceVerificationSetupProps = {
    onCancel: () => void;
};
export const DeviceVerificationSetup = forwardRef<HTMLDivElement, DeviceVerificationSetupProps>(
    ({ onCancel }, ref) => {
        const [recoveryKey, setRecoveryKey] = useState<string>();

        return (
            <Dialog ref={ref}>
                <Header
                    style={{
                        padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                        borderBottomWidth: config.borderWidth.B300,
                    }}
                    variant="Surface"
                    size="500"
                >
                    <Box grow="Yes">
                        <Text size="H4">Setup Device Verification</Text>
                    </Box>
                    <IconButton size="300" radii="300" onClick={onCancel}>
                        <Icon src={Icons.Cross} />
                    </IconButton>
                </Header>
                <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                    {recoveryKey ? (
                        <RecoveryKeyDisplay recoveryKey={recoveryKey} />
                    ) : (
                        <SetupVerification onComplete={setRecoveryKey} />
                    )}
                </Box>
            </Dialog>
        );
    }
);
type DeviceVerificationResetProps = {
    onCancel: () => void;
};
export const DeviceVerificationReset = forwardRef<HTMLDivElement, DeviceVerificationResetProps>(
    ({ onCancel }, ref) => {
        const [reset, setReset] = useState(false);

        return (
            <Dialog ref={ref}>
                <Header
                    style={{
                        padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                        borderBottomWidth: config.borderWidth.B300,
                    }}
                    variant="Surface"
                    size="500"
                >
                    <Box grow="Yes">
                        <Text size="H4">Reset Device Verification</Text>
                    </Box>
                    <IconButton size="300" radii="300" onClick={onCancel}>
                        <Icon src={Icons.Cross} />
                    </IconButton>
                </Header>
                {reset ? (
                    <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                        <UseStateProvider initial={undefined}>
                            {(recoveryKey: string | undefined, setRecoveryKey) =>
                                recoveryKey ? (
                                    <RecoveryKeyDisplay recoveryKey={recoveryKey} />
                                ) : (
                                    <SetupVerification onComplete={setRecoveryKey} mode="reset" />
                                )
                            }
                        </UseStateProvider>
                    </Box>
                ) : (
                    <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                        <Box direction="Column" gap="200">
                            <Text size="H1">✋🧑‍🚒🤚</Text>
                            <Text size="T300">Resetting device verification is permanent.</Text>
                            {/* What the guarded flow does (S9,
                                docs/security/key-backup-nudge-2026-11-02.md):
                                `SetupVerification` in mode "reset" checks
                                once, right before its first write, and
                                refuses while the account has a backup or the
                                backup check fails, so a backup that exists
                                when the form is submitted is not deleted;
                                otherwise it replaces cross-signing and secret
                                storage and creates a new backup. A backup
                                another app creates while the password prompt
                                is open would still be deleted (the record's
                                "What remains"). Secret storage is replaced
                                before that prompt, and the new cross-signing
                                keys are stored in it before they are
                                uploaded, so a cancel at the prompt leaves the
                                account's secret storage opening only with the
                                new recovery key, holding keys the homeserver
                                never received; the form then shows that key
                                (sixth review, `SETUP_PARTWAY_TEXT`). */}
                            <Text size="T300">
                                Anyone you have verified with will see security alerts, and you will
                                get a new recovery key and a new key backup. If your account already
                                has a key backup, or Blackout can’t check, Blackout stops before
                                changing anything. Blackout changes your secret storage before it
                                asks you to confirm your account, so if you stop at that step, save
                                the recovery key it then shows. You almost certainly do not want to
                                do this, unless you have lost <b>Recovery Key</b> or{' '}
                                <b>Recovery Passphrase</b> and every device you can verify from.
                            </Text>
                        </Box>
                        <Button variant="Critical" onClick={() => setReset(true)}>
                            <Text size="B400">Reset</Text>
                        </Button>
                    </Box>
                )}
            </Dialog>
        );
    }
);
