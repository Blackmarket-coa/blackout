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
import { PasswordInput } from './password-input';
import { ContainerColor } from '../styles/ContainerColor.css';
import { copyToClipboard } from '../utils/dom';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { clearSecretStorageKeys } from '../../client/secretStorageKeys';
import {
    SETUP_STOPPED_PARTWAY_TEXT,
    checkAccountKeyState,
    setupRefusal,
    type SetupMode,
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
    cancelCallback: () => void;
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

/** A step failed after this form's cross-signing was on the homeserver. */
class SetupStoppedPartway extends Error {}

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

                const recoveryKeyData = await crypto.createRecoveryKeyFromPassphrase(passphrase);
                if (!recoveryKeyData.encodedPrivateKey) {
                    throw new Error('Unexpected Error! Failed to create recovery key.');
                }
                clearSecretStorageKeys();

                let crossSigningOn = keepOwnCrossSigning;
                try {
                    // With the form's own cross-signing kept, this also
                    // stores those keys under the new recovery key: this
                    // device holds them, and the storage is new.
                    await crypto.bootstrapSecretStorage({
                        createSecretStorageKey: async () => recoveryKeyData,
                        setupNewSecretStorage: true,
                    });

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
                        crossSigningOn = true;
                    }

                    await crypto.resetKeyBackup();
                } catch (error) {
                    if (!crossSigningOn) throw error;
                    throw new SetupStoppedPartway(
                        error instanceof Error ? error.message : String(error)
                    );
                }

                onComplete(recoveryKeyData.encodedPrivateKey);
            },
            [mx, mode, onComplete, authUploadDeviceSigningKeys, ownCrossSigning, alive]
        )
    );

    const loading = setupState.status === AsyncStatus.Loading;

    const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
        evt.preventDefault();
        if (loading) return;

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
        <Box as="form" onSubmit={handleSubmit} direction="Column" gap="400">
            <Text size="T300">
                Generate a <b>Recovery Key</b> for verifying identity if you do not have access to
                other devices. Additionally, setup a passphrase as a memorable alternative.
            </Text>
            <Box direction="Column" gap="100">
                <Text size="L400">Passphrase (Optional)</Text>
                <PasswordInput name="passphraseInput" size="400" readOnly={loading} />
            </Box>
            <Button
                type="submit"
                disabled={loading}
                before={loading && <Spinner size="200" variant="Primary" fill="Solid" />}
            >
                <Text size="B400">Continue</Text>
            </Button>
            {setupState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: color.Critical.Main }}>
                    <b>{setupState.error ? setupState.error.message : 'Unexpected Error!'}</b>
                </Text>
            )}
            {setupState.status === AsyncStatus.Error &&
                setupState.error instanceof SetupStoppedPartway && (
                    <Text size="T200">{SETUP_STOPPED_PARTWAY_TEXT}</Text>
                )}
            {nextAuthData !== null && uiaAction && (
                <ActionUIAFlowsLoader
                    authData={nextAuthData ?? uiaAction.authData}
                    unsupported={() => (
                        <Text size="T200">
                            Authentication steps to perform this action are not supported by client.
                        </Text>
                    )}
                >
                    {(ongoingFlow) => (
                        <ActionUIA
                            authData={nextAuthData ?? uiaAction.authData}
                            ongoingFlow={ongoingFlow}
                            action={handleAction}
                            onCancel={uiaAction.cancelCallback}
                        />
                    )}
                </ActionUIAFlowsLoader>
            )}
        </Box>
    );
}

type RecoveryKeyDisplayProps = {
    recoveryKey: string;
};
export function RecoveryKeyDisplay({ recoveryKey }: RecoveryKeyDisplayProps) {
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
                Store the Recovery Key in a safe place for future use, as you will need it to verify
                your identity if you do not have access to other devices.
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
                    <Chip onClick={() => setShow(!show)} variant="Secondary" radii="Pill">
                        <Text size="B300">{show ? 'Hide' : 'Show'}</Text>
                    </Chip>
                </Box>
            </Box>
            <Box direction="Column" gap="200">
                <Button onClick={handleCopy}>
                    <Text size="B400">Copy</Text>
                </Button>
                <Button onClick={handleDownload} fill="Soft">
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
                                "What remains"). */}
                            <Text size="T300">
                                Anyone you have verified with will see security alerts, and you will
                                get a new recovery key and a new key backup. If your account already
                                has a key backup, or Blackout can’t check, Blackout stops before
                                changing anything. You almost certainly do not want to do this,
                                unless you have lost <b>Recovery Key</b> or{' '}
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
