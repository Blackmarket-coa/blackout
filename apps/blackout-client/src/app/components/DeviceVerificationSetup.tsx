import React, {
    FormEventHandler,
    forwardRef,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
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
import type { MatrixClient } from 'matrix-js-sdk';
import type { GeneratedSecretStorageKey } from 'matrix-js-sdk/lib/crypto-api';
import { PasswordInput } from './password-input';
import { ContainerColor } from '../styles/ContainerColor.css';
import { copyToClipboard } from '../utils/dom';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { clearSecretStorageKeys } from '../../client/secretStorageKeys';
import {
    SETUP_BUSY_TEXT,
    SETUP_CONFIRM_CANCELLED_TEXT,
    SETUP_CONFIRM_UNSUPPORTED_NEXT,
    SETUP_PARTWAY_TEXT,
    SETUP_WRITING_TEXT,
    checkAccountKeyState,
    checkBackupState,
    partwayStageAfter,
    setupConfirmUnsupportedText,
    setupRefusal,
    type SetupMode,
    type SetupPartwayStage,
} from '../../client/keyBackupCheck';
import { getSupportedUIAFlows } from '../utils/matrix-uia';
import { ActionUIA, ActionUIAFlowsLoader, SUPPORTED_IN_APP_UIA_STAGES } from './ActionUIA';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useAlive } from '../hooks/useAlive';
import { UseStateProvider } from './UseStateProvider';
import { useBackIntent } from '../hooks/useBackIntent';
import { handOffRecoveryKey } from './recoveryKeyHandoff';

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
 * started writing the account's secret storage. `stage` says where; `next`,
 * when set, replaces the stage's own next line.
 */
class SetupStoppedPartway extends Error {
    constructor(message: string, readonly stage: SetupPartwayStage, readonly next?: string) {
        super(message);
    }
}

/** The person closed the account confirmation the cross-signing upload asked for. */
class SetupConfirmCancelled extends Error {
    constructor() {
        super(SETUP_CONFIRM_CANCELLED_TEXT);
    }
}

/**
 * The homeserver asked the cross-signing upload for an account confirmation
 * the app cannot do (`setupConfirmUnsupportedText`).
 */
class SetupConfirmUnsupported extends Error {
    constructor(stages: readonly string[]) {
        super(setupConfirmUnsupportedText(stages));
    }
}

/**
 * The form was closed (unmounted) before the attempt's next write: it writes
 * nothing more. Never shown, since nothing is left to show it in.
 */
class SetupAbandoned extends Error {
    constructor() {
        super('The window was closed, so the setup stopped before its next change.');
    }
}

/**
 * The form went away while its account confirmation was open. Nothing can
 * answer that prompt any more, so the upload is cancelled with this, and the
 * attempt settles at stage `'cross_signing'` (eighth review). Never shown: the
 * attempt's key goes to `RecoveryKeyHandoffHost` with that stage's text.
 */
class SetupWindowGone extends Error {
    constructor() {
        super('The window went away while the account confirmation was open.');
    }
}

/**
 * How many attempts of each account (its `MatrixClient`) are between their
 * first write and settling. One whose window went away runs on, so a second
 * form could otherwise start writing over it (eighth review).
 */
const writingAttempts = new WeakMap<MatrixClient, number>();

const ignoreBackPress = () => undefined;

/**
 * Holds an attempt from its first write until the returned release runs: it
 * counts in `writingAttempts`, and the page asks the browser to confirm an
 * unload (`beforeunload`), since a reload or a quit loses the recovery key,
 * which exists only in this page's memory until it is shown. Whether a
 * confirmation appears is the browser's choice. Tied to the attempt, not to
 * the form, so it lasts while an attempt whose window went away runs on.
 */
const holdWhileWriting = (mx: MatrixClient): (() => void) => {
    writingAttempts.set(mx, (writingAttempts.get(mx) ?? 0) + 1);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
        event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
        window.removeEventListener('beforeunload', onBeforeUnload);
        writingAttempts.set(mx, Math.max(0, (writingAttempts.get(mx) ?? 1) - 1));
    };
};

/** Whether the app can do one of the flows a UIA answer offers (`ActionUIAFlowsLoader`'s test). */
const confirmationSupported = (authData: IAuthData): boolean =>
    getSupportedUIAFlows(authData.flows ?? [], SUPPORTED_IN_APP_UIA_STAGES).length > 0;

/** Every stage a UIA answer's flows name, once each. */
const confirmationStages = (authData: IAuthData): string[] =>
    Array.from(new Set((authData.flows ?? []).flatMap((flow) => flow.stages ?? [])));

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
     * Called with `true` right before an attempt's first write and with
     * `false` once that attempt has settled, its recovery key on screen (the
     * finished key through `onComplete`, or the partway key). The dialogs
     * below refuse to close in between (seventh review).
     */
    onWritingChange?: (writing: boolean) => void;
    /**
     * `'setup'` (default): the from-scratch flow, which goes on only when the
     * homeserver answers that the account has neither a backup nor
     * cross-signing. `'reset'`: the warned flow, which replaces cross-signing
     * on purpose but still never deletes a backup (see `setupRefusal`).
     */
    mode?: SetupMode;
};
export function SetupVerification({
    onComplete,
    onWritingChange,
    mode = 'setup',
}: SetupVerificationProps) {
    const mx = useMatrixClient();
    const alive = useAlive();

    const [uiaAction, setUIAAction] = useState<UIAAction<void>>();
    // The open account confirmation, for the unmount below: state is gone by then.
    const uiaActionRef = useRef<UIAAction<void>>();
    const [nextAuthData, setNextAuthData] = useState<IAuthData | null>(); // null means no next action.
    const [ownCrossSigning, setOwnCrossSigning] = useState<OwnCrossSigning | null>(null);
    const [heldKey, setHeldKey] = useState<HeldRecoveryKey | null>(null);
    const [writing, setWriting] = useState(false);

    const markWriting = useCallback(
        (value: boolean) => {
            if (alive()) setWriting(value);
            onWritingChange?.(value);
        },
        [alive, onWritingChange]
    );

    const handleAction = useCallback(
        async (authDict: AuthDict) => {
            if (!uiaAction) {
                throw new Error('Unexpected Error! UIA action is perform without data.');
            }
            if (alive()) {
                setNextAuthData(null);
            }
            const [authData] = await uiaAction.callback(authDict);

            // A later stage the app cannot do stops the attempt here, as at
            // the first answer (`authUploadDeviceSigningKeys`), rather than
            // leave it waiting on a prompt nobody can answer.
            if (authData && !confirmationSupported(authData)) {
                uiaAction.cancelCallback(new SetupConfirmUnsupported(confirmationStages(authData)));
                return;
            }

            if (alive() && authData) {
                setNextAuthData(authData);
            }
        },
        [uiaAction, alive]
    );

    const resetUIA = useCallback(() => {
        uiaActionRef.current = undefined;
        if (!alive()) return;
        setUIAAction(undefined);
        setNextAuthData(undefined);
    }, [alive]);

    // A form that goes away with its account confirmation open (a browser's
    // Back; for the chip, the search results shifting under it or its message
    // becoming readable) leaves a prompt nobody can answer, and the attempt
    // waited on it forever with its key unseen. Cancel it, so the attempt
    // settles and hands its key off (eighth review). An answer still on its
    // way is cancelled too: sending it leaves the ref set, and
    // `makeUIAAction` resolves only once that request comes back.
    useEffect(
        () => () => {
            uiaActionRef.current?.cancelCallback(new SetupWindowGone());
        },
        []
    );

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
                            // A confirmation the app cannot do (Matrix
                            // Authentication Service's
                            // `org.matrix.cross_signing_reset`, say) stops the
                            // attempt now, so it settles and shows its key;
                            // before, the form showed "not supported" with no
                            // way out and the attempt never settled.
                            if (!confirmationSupported(authData)) {
                                reject(new SetupConfirmUnsupported(confirmationStages(authData)));
                                return;
                            }
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
                                uiaActionRef.current = action;
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

                // The dialog's close button stays live through the check
                // above, which can wait up to ACCOUNT_KEY_CHECK_TIMEOUT_MS a
                // request, and through the key's derivation from a
                // passphrase. A close there unmounts this form: the attempt
                // stops and writes nothing (seventh review; before, it went
                // on writing with nothing on screen, and its recovery key was
                // never shown). From here on the dialog refuses to close
                // (`onWritingChange`) until the attempt has settled and its
                // key is on screen. Nothing runs between this test and that
                // call, so no click lands in between.
                if (!alive()) throw new SetupAbandoned();
                // Another attempt of this account whose window went away is
                // still writing: this one would write over it.
                if ((writingAttempts.get(mx) ?? 0) > 0) throw new Error(SETUP_BUSY_TEXT);
                markWriting(true);
                const releaseHold = holdWhileWriting(mx);
                // The form can still go away by another route while the
                // attempt writes (a browser's Back; for the chip, the search
                // results shifting under it or its message becoming
                // readable). The attempt then runs on until it settles, at
                // its end, at a step that fails or at an account
                // confirmation that has not gone through, and its key,
                // finished or partway, goes to `RecoveryKeyHandoffHost`
                // rather than to a form that is gone (eighth review; round 7
                // stopped before the next write instead, and the key of what
                // was already written was never shown).
                const handOff = (lead?: string) =>
                    handOffRecoveryKey({
                        userId: mx.getUserId(),
                        recoveryKey: encodedPrivateKey,
                        lead,
                    });

                try {
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
                                const masterKey = await crypto
                                    .getCrossSigningKeyId()
                                    .catch(() => null);
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
                        let attempt: SetupPartwayStage;
                        if (step === 'backup') {
                            // `resetKeyBackup` creates the backup before it stores
                            // the backup's key, so ask whether one exists now. Only
                            // a 404 M_NOT_FOUND means none.
                            const { backup } = await checkBackupState(mx);
                            attempt = backup === 'none' ? 'backup_none' : 'backup_unclear';
                        } else {
                            attempt = step;
                        }
                        // Never back to a less advanced stage than an earlier
                        // attempt reached (seventh review): this one undid
                        // nothing that attempt wrote.
                        const stage = partwayStageAfter(
                            attempt,
                            heldKey?.stage,
                            step === 'backup' || (step === 'secret_storage' && keepOwnCrossSigning)
                        );
                        const next =
                            error instanceof SetupConfirmUnsupported &&
                            SETUP_PARTWAY_TEXT[stage].next !== undefined
                                ? SETUP_CONFIRM_UNSUPPORTED_NEXT
                                : undefined;
                        if (alive()) setHeldKey({ key: recoveryKeyData, stage });
                        else handOff(SETUP_PARTWAY_TEXT[stage].what);
                        throw new SetupStoppedPartway(failureText(error), stage, next);
                    }

                    if (alive()) onComplete(encodedPrivateKey);
                    else handOff();
                } finally {
                    releaseHold();
                    markWriting(false);
                }
            },
            [
                mx,
                mode,
                onComplete,
                markWriting,
                authUploadDeviceSigningKeys,
                ownCrossSigning,
                heldKey,
                alive,
            ]
        )
    );

    const loading = setupState.status === AsyncStatus.Loading;
    const latestError = setupState.status === AsyncStatus.Error ? setupState.error : undefined;
    const partwayNext =
        latestError instanceof SetupStoppedPartway
            ? latestError.next ?? SETUP_PARTWAY_TEXT[latestError.stage].next
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
                {writing && <Text size="T200">{SETUP_WRITING_TEXT}</Text>}
                {nextAuthData !== null && uiaAction && (
                    // A UIA answer with no flow the app can do stops the
                    // attempt before it gets here (`confirmationSupported`);
                    // `unsupported` is a fallback that stays unreached.
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

/**
 * The setup and reset dialogs' close: refused while their form is writing
 * (`SetupVerification`'s `onWritingChange`), so a close can't take away the
 * window of an attempt that has started changing the account before it shows
 * its recovery key (seventh review). The button is disabled, and the
 * ref refuses a click that comes before React has re-rendered it. Escape and
 * a click outside never close these dialogs: every overlay that holds them
 * sets the focus trap's `escapeDeactivates` and `clickOutsideDeactivates` to
 * false. Android's back press, which the app otherwise turns into
 * `history.back()` and so into a route change that unmounts the window, is
 * claimed and ignored meanwhile (eighth review). The window can still go
 * away by another route (a browser's Back, the chip's host closing); the
 * attempt's key is then shown by `RecoveryKeyHandoffHost`, and a reload or a
 * quit loses it (the record's "What remains").
 */
const useCloseUnlessWriting = (onCancel: () => void) => {
    const writingRef = useRef(false);
    const [writing, setWriting] = useState(false);
    useBackIntent(writing, ignoreBackPress);
    const onWritingChange = useCallback((value: boolean) => {
        writingRef.current = value;
        setWriting(value);
    }, []);
    const close = useCallback(() => {
        if (!writingRef.current) onCancel();
    }, [onCancel]);
    return { writing, onWritingChange, close };
};

type DeviceVerificationSetupProps = {
    onCancel: () => void;
};
export const DeviceVerificationSetup = forwardRef<HTMLDivElement, DeviceVerificationSetupProps>(
    ({ onCancel }, ref) => {
        const [recoveryKey, setRecoveryKey] = useState<string>();
        const { writing, onWritingChange, close } = useCloseUnlessWriting(onCancel);

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
                    <IconButton
                        size="300"
                        radii="300"
                        onClick={close}
                        disabled={writing}
                        aria-label="Close"
                    >
                        <Icon src={Icons.Cross} />
                    </IconButton>
                </Header>
                <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                    {recoveryKey ? (
                        <RecoveryKeyDisplay recoveryKey={recoveryKey} />
                    ) : (
                        <SetupVerification
                            onComplete={setRecoveryKey}
                            onWritingChange={onWritingChange}
                        />
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
        const { writing, onWritingChange, close } = useCloseUnlessWriting(onCancel);

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
                    <IconButton
                        size="300"
                        radii="300"
                        onClick={close}
                        disabled={writing}
                        aria-label="Close"
                    >
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
                                    <SetupVerification
                                        onComplete={setRecoveryKey}
                                        onWritingChange={onWritingChange}
                                        mode="reset"
                                    />
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
                                (sixth review, `SETUP_PARTWAY_TEXT`). From the
                                first write until the attempt settles, this
                                dialog refuses to close, and a confirmation
                                Blackout can't do (anything but the password
                                or single sign-on) stops the attempt there
                                with that key shown (seventh review). */}
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
