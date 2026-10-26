import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
    computeSafetyCode,
    createReleaseKeySet,
    formatReleaseFingerprint,
    formatSafetyCode,
    publicReleaseIdentity,
    readRecoveryFile,
    RECOVERY_FILE_NAME,
    RECOVERY_PASSPHRASE_MIN_LENGTH,
    ReleaseRecoveryError,
    verifyReleaseIdentity,
    writeRecoveryFile,
    type ReleaseIdentity,
    type ReleaseIdentityDirectoryEntry,
} from '@blackout/protocol';
import { BlackoutSdkError, createReleaseIdentityActions, type ApiClient } from '@blackout/sdk';
import {
    currentKeySet,
    indexedDbReleaseKeyStore,
    mergeRecoveryContents,
    toRecoveryContents,
    withComparison,
    withNewCurrentKeySet,
    type DeviceReleaseKeys,
    type ReleaseKeyStore,
} from './releaseKeyStore';
import { releaseKeysSupported } from './support';

/*
 * Every sentence here says what the keys do today and no more
 * (docs/security/deadman-release-design-2026-10-24.md §7;
 * docs/security/release-identities-2026-10-26.md). Arming is closed, so
 * nothing is encrypted for these keys yet, and the screen says so.
 */
export const RELEASE_KEYS_PURPOSE =
    "Release keys are for dead-man switch releases, which aren't available yet: you can't arm " +
    'a new switch, so nothing is encrypted for these keys today. In the design Blackout is ' +
    "building, a message released to you is encrypted for your release keys on the sender's " +
    'device, so that only a device holding your private keys can open it.';

export const RELEASE_KEYS_SERVER =
    "Blackout's server keeps the public half of your keys, and shows it, with any keys you " +
    'replaced, to anyone signed in on this server who looks you up. This app never sends the ' +
    'server the private half, which stays on this device and in any recovery file you save. ' +
    'Looking someone up tells the server that you did.';

export const RELEASE_KEYS_LOSS =
    'If this device is lost or its app data is cleared, and you have no recovery file, your ' +
    "private release keys are gone, and anything encrypted for them can't be opened. New keys " +
    "don't bring old ones back.";

export const RELEASE_KEYS_SIGN_OUT =
    "Signing out of Blackout doesn't remove release keys from this device. On a device other " +
    'people use, save a recovery file, then remove the keys here before you sign out.';

export const RELEASE_KEYS_BROWSER =
    "In a web browser, this app's code comes from Blackout's server, and a server made to send " +
    'altered code could read your private keys or show you a false code. The desktop and mobile ' +
    'apps carry their own copy of the code.';

export const RELEASE_KEYS_UNSUPPORTED =
    "This browser or device can't hold release keys: it lacks WebCrypto's Ed25519 or X25519, " +
    'or IndexedDB.';

export const compareHow = (name: string): string =>
    `Compare this code with ${name} in person or on a call where you know their voice. Don't ` +
    "compare it over Blackout: this check is about Blackout's server, so it has to happen " +
    "somewhere the server isn't.";

export const COMPARE_MEANING =
    "If the codes match, you have each other's real keys. If they don't, stop, and don't rely " +
    'on these keys.';

export const RECOVERY_SAVE_NOTE =
    'The file holds your private release keys and the list of people you compared codes with, ' +
    'encrypted with your passphrase. Anyone who has the file and your passphrase can use your ' +
    `release keys. Use at least ${RECOVERY_PASSPHRASE_MIN_LENGTH} characters and a passphrase you ` +
    "don't use anywhere else: Blackout can't recover it for you. A file doesn't include " +
    'comparisons you make after saving it, so save a new one after you compare with someone.';

export type ReleaseKeysPanelProps = {
    apiClient: ApiClient;
    store?: ReleaseKeyStore;
    checkSupport?: () => Promise<boolean>;
    /** Hands the person a file; the default asks the browser to download it. */
    saveFile?: (name: string, text: string) => void;
    now?: () => Date;
};

const downloadTextFile = (name: string, text: string): void => {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
        return;
    }
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
};

const formatLocalTime = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        date
    );
};

/** The first 16 hex digits, grouped: for recognising a key, not for checking one. */
const shortFingerprint = (fingerprint: string): string =>
    formatReleaseFingerprint(fingerprint.slice(0, 16));

const sameIdentity = (a: ReleaseIdentity, b: ReleaseIdentity): boolean =>
    JSON.stringify(publicReleaseIdentity(a)) === JSON.stringify(publicReleaseIdentity(b));

const recoveryErrorText = (cause: unknown): string => {
    if (cause instanceof ReleaseRecoveryError) {
        switch (cause.code) {
            case 'wrong_passphrase_or_damaged':
                return 'The passphrase is wrong, or the file was changed or damaged.';
            case 'other_account':
                return "This recovery file holds another Blackout account's release keys.";
            case 'malformed':
                return "This isn't a Blackout recovery file, or it's damaged or incomplete.";
            case 'unsupported':
                return "This recovery file is from a version of Blackout this app can't read.";
            case 'contents':
                return "The keys in this file don't fit together, so it can't be used.";
            case 'passphrase_length':
                return `A recovery passphrase has at least ${RECOVERY_PASSPHRASE_MIN_LENGTH} characters.`;
            case 'too_large':
                return 'There is too much to fit in one recovery file.';
        }
    }
    return cause instanceof Error ? cause.message : 'Something went wrong.';
};

const errorText = (cause: unknown): string =>
    cause instanceof Error ? cause.message : 'Something went wrong.';

type Notice = { tone: 'info' | 'error'; text: string };

type Comparing =
    | { status: 'idle' }
    | { status: 'looking' }
    | { status: 'nobody' }
    | { status: 'self' }
    | { status: 'invalid'; matrixId: string }
    | { status: 'error'; text: string }
    | {
          status: 'code';
          matrixId: string;
          accountId: string;
          fingerprint: string;
          groups: string[];
      }
    | { status: 'recorded'; matrixId: string }
    | { status: 'rejected'; matrixId: string };

type Confirming = 'replace' | 'remove' | null;

const sectionStyle: CSSProperties = {
    border: '1px solid var(--border-default, #444)',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
};

const codeGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, auto)',
    justifyContent: 'start',
    gap: '6px 16px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 22,
    margin: '12px 0',
};

/**
 * Settings → Release keys: create them on this device, publish the public
 * half, save and load a recovery file, and compare a safety code with
 * someone. The private halves never leave this device except in a recovery
 * file the person saves.
 */
export const ReleaseKeysPanel = ({
    apiClient,
    store = indexedDbReleaseKeyStore,
    checkSupport = releaseKeysSupported,
    saveFile = downloadTextFile,
    now = () => new Date(),
}: ReleaseKeysPanelProps) => {
    const actions = useMemo(() => createReleaseIdentityActions(apiClient), [apiClient]);
    const [supported, setSupported] = useState<boolean | null>(null);
    const [me, setMe] = useState<ReleaseIdentityDirectoryEntry | null>(null);
    const [device, setDevice] = useState<DeviceReleaseKeys | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [progress, setProgress] = useState<number | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [confirming, setConfirming] = useState<Confirming>(null);
    const [savePassphrase, setSavePassphrase] = useState('');
    const [saveConfirm, setSaveConfirm] = useState('');
    const [loadText, setLoadText] = useState<string | null>(null);
    const [loadPassphrase, setLoadPassphrase] = useState('');
    const [compareInput, setCompareInput] = useState('');
    const [comparing, setComparing] = useState<Comparing>({ status: 'idle' });

    const refresh = useCallback(async () => {
        try {
            const entry = await actions.getMine();
            setMe(entry);
            setDevice(await store.load(entry.accountId));
            setLoadError(null);
        } catch (cause) {
            setLoadError(errorText(cause));
        }
    }, [actions, store]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const ok = await checkSupport();
            if (cancelled) return;
            setSupported(ok);
            if (ok) await refresh();
        })();
        return () => {
            cancelled = true;
        };
    }, [checkSupport, refresh]);

    const local = currentKeySet(device);
    const publication: 'published' | 'unpublished' | 'different' | null = !local
        ? null
        : !me?.current
        ? 'unpublished'
        : sameIdentity(me.current.identity, local.identity)
        ? 'published'
        : 'different';
    const serverName = me?.matrixId?.slice(me.matrixId.indexOf(':') + 1) ?? 'this server';

    const publish = useCallback(
        async (record: DeviceReleaseKeys) => {
            const keySet = currentKeySet(record);
            if (!keySet) return;
            try {
                setMe(await actions.publishMine(keySet.identity));
                setNotice({
                    tone: 'info',
                    text: "Published: Blackout's server now has this release key for you.",
                });
            } catch (cause) {
                setNotice({
                    tone: 'error',
                    text: `Your keys are on this device, but publishing them failed: ${errorText(
                        cause
                    )}`,
                });
            }
        },
        [actions]
    );

    const createKeys = async () => {
        if (!me) return;
        setConfirming(null);
        setBusy('create');
        setNotice(null);
        try {
            const keySet = await createReleaseKeySet(me.accountId, now());
            const next = withNewCurrentKeySet(device, me.accountId, keySet, now());
            await store.save(next);
            setDevice(next);
            setComparing({ status: 'idle' });
            await publish(next);
        } catch (cause) {
            setNotice({ tone: 'error', text: `Creating release keys failed: ${errorText(cause)}` });
        } finally {
            setBusy(null);
        }
    };

    const publishNow = async () => {
        if (!device) return;
        setBusy('publish');
        try {
            await publish(device);
        } finally {
            setBusy(null);
        }
    };

    const removeKeys = async () => {
        if (!me) return;
        setConfirming(null);
        setBusy('remove');
        try {
            await store.remove(me.accountId);
            setDevice(null);
            setComparing({ status: 'idle' });
            setNotice({
                tone: 'info',
                text: "Removed your release keys from this device. Blackout's server still has the public half.",
            });
        } catch (cause) {
            setNotice({ tone: 'error', text: `Removing them failed: ${errorText(cause)}` });
        } finally {
            setBusy(null);
        }
    };

    const saveRecoveryFile = async () => {
        if (!device) return;
        if (savePassphrase !== saveConfirm) {
            setNotice({ tone: 'error', text: "The two passphrases don't match." });
            return;
        }
        if (Array.from(savePassphrase.normalize('NFC')).length < RECOVERY_PASSPHRASE_MIN_LENGTH) {
            setNotice({
                tone: 'error',
                text: `Use a passphrase of at least ${RECOVERY_PASSPHRASE_MIN_LENGTH} characters.`,
            });
            return;
        }
        setBusy('save');
        setProgress(0);
        setNotice(null);
        try {
            const text = await writeRecoveryFile(
                toRecoveryContents(device, now()),
                savePassphrase,
                {
                    onProgress: setProgress,
                }
            );
            saveFile(RECOVERY_FILE_NAME, text);
            setSavePassphrase('');
            setSaveConfirm('');
            setNotice({
                tone: 'info',
                text:
                    `Your browser was asked to save ${RECOVERY_FILE_NAME}. Check that it was ` +
                    'saved, and keep it somewhere other than this device.',
            });
        } catch (cause) {
            setNotice({ tone: 'error', text: recoveryErrorText(cause) });
        } finally {
            setBusy(null);
            setProgress(null);
        }
    };

    const loadRecoveryFile = async () => {
        if (!me || loadText === null) return;
        setBusy('load');
        setProgress(0);
        setNotice(null);
        try {
            const contents = await readRecoveryFile(loadText, loadPassphrase, {
                accountId: me.accountId,
                onProgress: setProgress,
            });
            const next = mergeRecoveryContents(device, contents, now());
            await store.save(next);
            setDevice(next);
            setLoadPassphrase('');
            setLoadText(null);
            setComparing({ status: 'idle' });
            setNotice({ tone: 'info', text: 'Loaded your release keys from the recovery file.' });
        } catch (cause) {
            setNotice({ tone: 'error', text: recoveryErrorText(cause) });
        } finally {
            setBusy(null);
            setProgress(null);
        }
    };

    const lookUp = async () => {
        const matrixId = compareInput.trim();
        if (!me || !local || matrixId.length === 0) return;
        setComparing({ status: 'looking' });
        try {
            const entry = await actions.lookupByMatrixId(matrixId);
            if (entry.accountId === me.accountId) {
                setComparing({ status: 'self' });
                return;
            }
            const check = entry.current
                ? await verifyReleaseIdentity(entry.current.identity, {
                      accountId: entry.accountId,
                  })
                : null;
            if (!check || !check.ok) {
                setComparing({ status: 'invalid', matrixId });
                return;
            }
            const code = await computeSafetyCode(local.fingerprint, check.fingerprint);
            setComparing({
                status: 'code',
                matrixId: entry.matrixId ?? matrixId,
                accountId: entry.accountId,
                fingerprint: check.fingerprint,
                groups: formatSafetyCode(code),
            });
        } catch (cause) {
            if (cause instanceof BlackoutSdkError && cause.status === 404) {
                setComparing({ status: 'nobody' });
            } else {
                setComparing({ status: 'error', text: errorText(cause) });
            }
        }
    };

    const recordMatch = async () => {
        if (comparing.status !== 'code' || !device || !local) return;
        const at = now();
        const next = withComparison(
            device,
            {
                accountId: comparing.accountId,
                matrixId: comparing.matrixId,
                fingerprint: comparing.fingerprint,
                ownFingerprint: local.fingerprint,
                comparedAt: at.toISOString(),
            },
            at
        );
        try {
            await store.save(next);
            setDevice(next);
            setComparing({ status: 'recorded', matrixId: comparing.matrixId });
        } catch (cause) {
            setComparing({ status: 'error', text: errorText(cause) });
        }
    };

    const working = busy !== null;

    if (supported === false) {
        return (
            <section style={{ padding: 12 }}>
                <h2 style={{ marginTop: 0 }}>Release keys</h2>
                <p>{RELEASE_KEYS_PURPOSE}</p>
                <p role="alert">{RELEASE_KEYS_UNSUPPORTED}</p>
            </section>
        );
    }

    return (
        <section style={{ padding: 12 }}>
            <h2 style={{ marginTop: 0 }}>Release keys</h2>
            <p>{RELEASE_KEYS_PURPOSE}</p>
            <p>{RELEASE_KEYS_SERVER}</p>
            <p>{RELEASE_KEYS_LOSS}</p>
            <p>{RELEASE_KEYS_SIGN_OUT}</p>

            {notice && (
                <p
                    role={notice.tone === 'error' ? 'alert' : 'status'}
                    style={{ color: notice.tone === 'error' ? 'tomato' : undefined }}
                >
                    {notice.text}
                </p>
            )}
            {progress !== null && (
                <p role="status">
                    Working on the recovery file: {Math.round(progress * 100)}%. This can take
                    several seconds.
                </p>
            )}

            {supported === null || (!me && !loadError) ? (
                <p>Loading…</p>
            ) : loadError ? (
                <div role="alert">
                    <p>Your release keys could not be loaded: {loadError}</p>
                    <button type="button" onClick={() => void refresh()}>
                        Try again
                    </button>
                </div>
            ) : (
                me && (
                    <>
                        <div style={sectionStyle}>
                            <h3 style={{ marginTop: 0 }}>Your keys on this device</h3>
                            {local ? (
                                <>
                                    <p>
                                        Your release key:{' '}
                                        <code data-testid="own-fingerprint">
                                            {formatReleaseFingerprint(local.fingerprint)}
                                        </code>
                                        . Created {formatLocalTime(local.createdAt)}.
                                    </p>
                                    {publication === 'published' && (
                                        <p data-testid="publication">
                                            Published: Blackout&apos;s server has this key for you.
                                        </p>
                                    )}
                                    {publication === 'unpublished' && (
                                        <p data-testid="publication">
                                            Not published yet: nobody can look up your key until you
                                            publish it.
                                        </p>
                                    )}
                                    {publication === 'different' && me.current && (
                                        <p data-testid="publication">
                                            Blackout&apos;s server has a different release key for
                                            you ({shortFingerprint(me.current.fingerprint)}).
                                            Publishing this device&apos;s key replaces it, and
                                            anyone who compared a code with you would have to
                                            compare again.
                                        </p>
                                    )}
                                    {publication !== 'published' && (
                                        <button
                                            type="button"
                                            disabled={working}
                                            onClick={() => void publishNow()}
                                        >
                                            Publish this device&apos;s key
                                        </button>
                                    )}
                                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                        <button
                                            type="button"
                                            disabled={working}
                                            onClick={() => setConfirming('replace')}
                                        >
                                            Create new release keys
                                        </button>
                                        <button
                                            type="button"
                                            disabled={working}
                                            onClick={() => setConfirming('remove')}
                                        >
                                            Remove release keys from this device
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {me.current ? (
                                        <p>
                                            Blackout&apos;s server has release keys for you that
                                            aren&apos;t on this device (
                                            {shortFingerprint(me.current.fingerprint)}). If you made
                                            them on another device, load that device&apos;s recovery
                                            file below. Creating new keys replaces them, and anyone
                                            who compared a code with you would have to compare
                                            again.
                                        </p>
                                    ) : (
                                        <p>You have no release keys yet.</p>
                                    )}
                                    <button
                                        type="button"
                                        disabled={working}
                                        onClick={() =>
                                            me.current
                                                ? setConfirming('replace')
                                                : void createKeys()
                                        }
                                    >
                                        {me.current
                                            ? 'Create new release keys'
                                            : 'Create release keys on this device'}
                                    </button>
                                </>
                            )}
                            {confirming === 'replace' && (
                                <div
                                    role="group"
                                    aria-label="Confirm new keys"
                                    style={sectionStyle}
                                >
                                    <p>
                                        New keys replace your current ones for everyone who looks
                                        you up, and anyone who compared a code with you would have
                                        to compare again.
                                        {local
                                            ? ' Your current keys stay on this device as old keys.'
                                            : ''}
                                    </p>
                                    <button type="button" onClick={() => void createKeys()}>
                                        Create new keys
                                    </button>{' '}
                                    <button type="button" onClick={() => setConfirming(null)}>
                                        Keep my keys
                                    </button>
                                </div>
                            )}
                            {confirming === 'remove' && (
                                <div role="group" aria-label="Confirm removal" style={sectionStyle}>
                                    <p>
                                        This deletes your private release keys and your list of
                                        comparisons from this device. Blackout&apos;s server keeps
                                        the public half. Without a recovery file, they can&apos;t be
                                        brought back.
                                    </p>
                                    <button type="button" onClick={() => void removeKeys()}>
                                        Remove from this device
                                    </button>{' '}
                                    <button type="button" onClick={() => setConfirming(null)}>
                                        Keep them
                                    </button>
                                </div>
                            )}
                        </div>

                        <div style={sectionStyle}>
                            <h3 style={{ marginTop: 0 }}>Recovery file</h3>
                            {local && (
                                <>
                                    <p>{RECOVERY_SAVE_NOTE}</p>
                                    <label style={{ display: 'block' }}>
                                        Passphrase{' '}
                                        <input
                                            type="password"
                                            autoComplete="new-password"
                                            value={savePassphrase}
                                            onChange={(event) =>
                                                setSavePassphrase(event.target.value)
                                            }
                                        />
                                    </label>
                                    <label style={{ display: 'block', marginTop: 4 }}>
                                        Passphrase again{' '}
                                        <input
                                            type="password"
                                            autoComplete="new-password"
                                            value={saveConfirm}
                                            onChange={(event) => setSaveConfirm(event.target.value)}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        style={{ marginTop: 8 }}
                                        disabled={working}
                                        onClick={() => void saveRecoveryFile()}
                                    >
                                        Save a recovery file
                                    </button>
                                </>
                            )}
                            <p>
                                To load one, choose the file and enter its passphrase. Its keys
                                become your current keys on this device; any other keys here are
                                kept as old keys, and its comparisons are added to this
                                device&apos;s.
                            </p>
                            <label style={{ display: 'block' }}>
                                Recovery file{' '}
                                <input
                                    type="file"
                                    accept=".json,application/json"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (!file) return;
                                        void file.text().then(setLoadText);
                                    }}
                                />
                            </label>
                            <label style={{ display: 'block', marginTop: 4 }}>
                                Its passphrase{' '}
                                <input
                                    type="password"
                                    autoComplete="current-password"
                                    value={loadPassphrase}
                                    onChange={(event) => setLoadPassphrase(event.target.value)}
                                />
                            </label>
                            <button
                                type="button"
                                style={{ marginTop: 8 }}
                                disabled={working || loadText === null}
                                onClick={() => void loadRecoveryFile()}
                            >
                                Load the recovery file
                            </button>
                        </div>

                        {local && (
                            <div style={sectionStyle}>
                                <h3 style={{ marginTop: 0 }}>Compare a safety code</h3>
                                {publication !== 'published' ? (
                                    <p>
                                        Publish your key first: the other person&apos;s device gets
                                        it from Blackout&apos;s server.
                                    </p>
                                ) : (
                                    <>
                                        <p>
                                            Enter the Matrix id of someone with an account on this
                                            server. Only accounts on this server can be compared.
                                        </p>
                                        <label style={{ display: 'block' }}>
                                            Their Matrix id{' '}
                                            <input
                                                type="text"
                                                placeholder={`@name:${serverName}`}
                                                value={compareInput}
                                                onChange={(event) => {
                                                    setCompareInput(event.target.value);
                                                    setComparing({ status: 'idle' });
                                                }}
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            style={{ marginTop: 8 }}
                                            disabled={
                                                comparing.status === 'looking' ||
                                                compareInput.trim().length === 0
                                            }
                                            onClick={() => void lookUp()}
                                        >
                                            Show the code
                                        </button>
                                        {comparing.status === 'nobody' && (
                                            <p role="status">
                                                Nobody on this server with that Matrix id has
                                                published release keys.
                                            </p>
                                        )}
                                        {comparing.status === 'self' && (
                                            <p role="status">
                                                That&apos;s you. Compare a code with someone else.
                                            </p>
                                        )}
                                        {comparing.status === 'invalid' && (
                                            <p role="alert">
                                                The release keys Blackout&apos;s server gave for{' '}
                                                {comparing.matrixId} failed their check, so there is
                                                no code to compare.
                                            </p>
                                        )}
                                        {comparing.status === 'error' && (
                                            <p role="alert">{comparing.text}</p>
                                        )}
                                        {comparing.status === 'code' && (
                                            <div data-testid="safety-code">
                                                <p>{compareHow(comparing.matrixId)}</p>
                                                <div style={codeGridStyle} aria-label="Safety code">
                                                    {comparing.groups.map((group, index) => (
                                                        <span key={index}>{group}</span>
                                                    ))}
                                                </div>
                                                <p>{COMPARE_MEANING}</p>
                                                <p>
                                                    Ask {comparing.matrixId} to open Settings →
                                                    Release keys on their device and show the code
                                                    for your Matrix id, {me.matrixId}.
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => void recordMatch()}
                                                >
                                                    The codes match
                                                </button>{' '}
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setComparing({
                                                            status: 'rejected',
                                                            matrixId: comparing.matrixId,
                                                        })
                                                    }
                                                >
                                                    They don&apos;t match
                                                </button>
                                            </div>
                                        )}
                                        {comparing.status === 'recorded' && (
                                            <p role="status">
                                                Recorded on this device: you compared codes with{' '}
                                                {comparing.matrixId}. Save a new recovery file to
                                                keep this comparison.
                                            </p>
                                        )}
                                        {comparing.status === 'rejected' && (
                                            <p role="status">
                                                Nothing was recorded. Don&apos;t rely on{' '}
                                                {comparing.matrixId}&apos;s keys until a code you
                                                compare matches.
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {device && device.comparisons.length > 0 && (
                            <div style={sectionStyle}>
                                <h3 style={{ marginTop: 0 }}>
                                    People you compared codes with on this device
                                </h3>
                                <ul data-testid="comparisons">
                                    {device.comparisons.map((entry) => (
                                        <li key={`${entry.accountId}:${entry.fingerprint}`}>
                                            {entry.matrixId ?? entry.accountId}, compared{' '}
                                            {formatLocalTime(entry.comparedAt)}, their key{' '}
                                            <code>{shortFingerprint(entry.fingerprint)}</code>
                                            {local && entry.ownFingerprint !== local.fingerprint
                                                ? '. You compared before you replaced your keys: compare again.'
                                                : ''}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <p style={{ opacity: 0.8 }}>{RELEASE_KEYS_BROWSER}</p>
                    </>
                )
            )}
        </section>
    );
};

export default ReleaseKeysPanel;
