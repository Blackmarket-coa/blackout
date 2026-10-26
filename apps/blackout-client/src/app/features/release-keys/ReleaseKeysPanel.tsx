import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
    computeSafetyCode,
    createReleaseKeySet,
    formatReleaseFingerprint,
    formatSafetyCode,
    readRecoveryFile,
    RECOVERY_FILE_NAME,
    RECOVERY_PASSPHRASE_MIN_LENGTH,
    RELEASE_IDENTITY_PUBLISHES_PER_DAY,
    RELEASE_IDENTITY_STORAGE_LIMIT,
    ReleaseRecoveryError,
    verifyReleaseIdentity,
    writeRecoveryFile,
    type ReleaseIdentity,
    type ReleaseIdentityDirectoryEntry,
    type ReleaseRecoveryContents,
    type StoredReleaseKeySet,
} from '@blackout/protocol';
import { BlackoutSdkError, createReleaseIdentityActions, type ApiClient } from '@blackout/sdk';
import {
    currentKeySet,
    indexedDbReleaseKeyStore,
    mergeRecoveryContents,
    planRecoveryLoad,
    sameDeviceRecord,
    sameReleaseIdentity,
    toRecoveryContents,
    withComparison,
    withNewCurrentKeySet,
    type DeviceReleaseKeys,
    type RecoveryCurrentChoice,
    type RecoveryLoadPlan,
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
    "Signing out of Blackout doesn't remove release keys from this device, and the panic wipe " +
    'removes them only if you tick its “Also delete release keys from this device”. On a ' +
    'device other people use, save a recovery file, then remove the keys here before you ' +
    'sign out.';

export const RELEASE_KEYS_BROWSER =
    "In a web browser, this app's code comes from Blackout's server, and a server made to send " +
    'altered code could read your private keys or show you a false code. The desktop and mobile ' +
    'apps carry their own copy of the code.';

export const RELEASE_KEYS_UNSUPPORTED =
    "This browser or device can't hold release keys: it lacks WebCrypto's Ed25519 or X25519, " +
    'or IndexedDB.';

// §7 of the release design approved COMPARE_MEANING and compareHow; the
// independent review (M1, and the voice-cloning point) changed them only as
// far as needed to be true. The record lists that for the operator.
export const compareHow = (name: string): string =>
    `Compare this code with ${name} in person. If you can't, use a call where you know their ` +
    "voice, though a voice can be imitated and a call intercepted. Don't compare it over " +
    "Blackout: this check is about Blackout's server, so it has to happen somewhere the " +
    "server isn't.";

export const COMPARE_READ_ALL =
    'Read all twelve groups to each other, in order. If any group differs, stop. Checking only ' +
    'some of them is much weaker: a server could fake a code that starts or ends the same.';

export const COMPARE_MEANING =
    "If all twelve groups match, you have each other's real keys, as long as neither of you " +
    "is running altered app code. If any group differs, stop, and don't rely on these keys.";

/** Shown next to the button that creates keys: creating them also publishes them. */
export const RELEASE_KEYS_LISTING =
    'Creating release keys also publishes their public half: from then on, anyone signed in ' +
    'on this server can see that you have release keys, and when you change them. The listing ' +
    'stays until your account is deleted; there is no way to unpublish.';

/** When someone replaces their keys: what else to do. */
export const RELEASE_KEYS_REPLACE_GUIDANCE =
    'If you are replacing them because a device was lost, or someone else may have it: sign ' +
    'that device out of your account (from a Matrix client that lists your sessions, or by ' +
    'resetting your password with “Sign out of other devices”), and tell the people you ' +
    'compared codes with, in person or on a call and not over Blackout, that your key changed, ' +
    'so that they compare again.';

/**
 * H1 of the independent review: when the server holds a release key for this
 * person that is not one of this device's, the screen says plainly who could
 * have put it there, rather than only that it differs.
 */
export const foreignKeyWarning = (fingerprint: string): string =>
    `Blackout's server has a release key for you that isn't one of this device's ` +
    `(${fingerprint}). If you made it on another device, load that device's recovery file ` +
    "below. If you didn't, someone with access to your account, or Blackout's server, " +
    'published it.';

/**
 * The server's current key for this person fails its check on this device.
 * The API checks a key before it takes one, so nobody publishing through it
 * put this one there.
 */
export const INVALID_SERVER_KEY_WARNING =
    "Blackout's server gives a release key for you that fails its check on this device. Its " +
    'API checks keys before it takes them, so the server itself, or a fault in it, put this ' +
    'one there. Nobody can compare a code with you while it does.';

/** The same, for a device that holds no release keys at all. */
export const missingKeysWarning = (fingerprint: string): string =>
    `Blackout's server has release keys for you that aren't on this device (${fingerprint}). ` +
    'If you made them on another device, or removed them from this one, load a recovery file ' +
    "below. If you didn't make them, someone with access to your account, or Blackout's " +
    'server, published them.';

/**
 * The server shows a key this device replaced as current, and lists the newer
 * one as replaced. The API refuses an identity it has seen before for the
 * account, but it never saw a key that was replaced here before it was
 * published, and an identity carries no sequence number, so it cannot tell
 * that key is older (the re-check's N1). Every possibility is named.
 */
export const rolledBackWarning = (fingerprint: string): string =>
    `Blackout's server shows a key this device replaced (${fingerprint}) as your current key, ` +
    'and lists your newer key as replaced. Either that older key was published after your ' +
    'newer one, from another tab or device of yours or by someone with access to your ' +
    "account who has it, or Blackout's server put it back. Tell the people you compared " +
    'codes with, outside Blackout, not to rely on your key until you compare again.';

/** Next to "Publish this device's key" when the server has a key this device didn't make. */
export const FOREIGN_KEY_PUBLISH_NOTE =
    "Publishing this device's key replaces it for good: if it is your own key from another " +
    "device, it can't be published again afterwards, and anyone who compared a code with you " +
    'would have to compare again.';

/** A tab tried to publish a key set the store no longer has as current (N1). */
export const CHANGED_ELSEWHERE_NOT_PUBLISHED =
    'Nothing was published: the release keys on this device were changed or removed in ' +
    'another tab or window after this tab showed them. Check what is shown now before you ' +
    'publish.';

/** Added to the saved notice when the keys changed after this tab showed them (N3). */
export const SAVED_STORED_KEYS =
    'The release keys on this device had changed in another tab or window, so the file holds ' +
    'the ones shown now.';

/** Saving found no release keys on this device any more (N3). */
export const NO_KEYS_TO_SAVE =
    'Nothing was saved: there are no release keys on this device any more. They were removed ' +
    'in another tab or window, or by the panic wipe.';

/** Next to the passphrase fields (L4): the attribute alone may be ignored. */
export const RECOVERY_PASSPHRASE_DONT_SAVE =
    "If your browser offers to save a recovery file's passphrase, say no: anyone who can see " +
    "this browser's saved passwords could then open the file.";

export const RELEASE_KEY_REPLACED_ON_SERVER =
    "Blackout's server lists this device's key as replaced, so it can't be published again. " +
    "To replace the server's key, create new release keys.";

export const PUBLISH_RATE_LIMITED =
    `Blackout's server takes at most ${RELEASE_IDENTITY_PUBLISHES_PER_DAY} new release keys ` +
    "for an account in any 24 hours, and this account has reached that. This device's keys " +
    'are kept: publish them from here later.';

export const PUBLISH_REUSED =
    "Blackout's server refused this key: it was replaced before, and a replaced key can't be " +
    'made current again. Create new release keys instead.';

export const PUBLISH_STORAGE_LIMIT =
    `Blackout's server refused this key: this account has published ${RELEASE_IDENTITY_STORAGE_LIMIT} ` +
    "release keys, as many as the server keeps. Ask the server's operator for help.";

/** The lookup answer named another Matrix id than the one typed (L3). */
export const lookupMismatch = (typed: string, answered: string | null): string =>
    `Blackout's server answered for ${
        answered ?? 'no Matrix id'
    } when you asked for ${typed}, so there is no code to compare.`;

export const RECOVERY_SAVE_NOTE =
    'The file holds your private release keys and the list of people you compared codes with, ' +
    'encrypted with your passphrase. Anyone who has the file and your passphrase, or who ' +
    'guesses the passphrase by trying many on a copy of the file, can use your release keys. ' +
    `Use at least ${RECOVERY_PASSPHRASE_MIN_LENGTH} characters and a passphrase you don't use ` +
    "anywhere else: Blackout can't recover it for you. A file doesn't include comparisons you " +
    'make after saving it, so save a new one after you compare with someone.';

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

const sameIdentity = sameReleaseIdentity;

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
    | { status: 'mismatch'; typed: string; answered: string | null }
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

type AskPlan = Extract<RecoveryLoadPlan, { kind: 'ask' }>;

type PendingLoad = {
    contents: ReleaseRecoveryContents;
    plan: AskPlan;
    replacedOnServer: boolean;
};

/** Said when another tab or window changed the keys while this one showed them. */
export const CHANGED_ELSEWHERE_NOT_REMOVED =
    'Your release keys on this device changed in another tab or window, so nothing was ' +
    'removed. Check them below, then remove them again if you still want to.';

export const CHANGED_ELSEWHERE_NOT_RECORDED =
    'Nothing was recorded: your release keys were removed from this device in another tab ' +
    'or window.';

export const COMPARED_WITH_OLD_KEY =
    'Recorded, but your release keys changed in another tab or window while you compared: ' +
    'that code was for your previous key, so compare again with your new one.';

/** The question asked before a recovery file's key may replace this device's current one. */
export const recoveryLoadQuestion = (
    pending: PendingLoad,
    describe: (keySet: AskPlan['device']) => string
): string => {
    const { plan } = pending;
    const why =
        plan.reason === 'unknown'
            ? `This recovery file's current release key (${describe(
                  plan.file
              )}) isn't one this device holds, and Blackout's server doesn't list it. Only the file's own creation time, which nothing signs, says it is newer than the one this device uses (${describe(
                  plan.device
              )}).`
            : plan.reason === 'older'
            ? `This recovery file's current release key (${describe(
                  plan.file
              )}) is older than the one this device uses (${describe(plan.device)}).`
            : pending.replacedOnServer
            ? `This recovery file's current release key (${describe(
                  plan.file
              )}) was replaced: Blackout's server lists it as replaced, so it can't be published again. This device uses ${describe(
                  plan.device
              )}.`
            : `This recovery file's current release key (${describe(
                  plan.file
              )}) was replaced on this device, which uses ${describe(plan.device)}.`;
    return (
        `${why} Keep using this device's key? Either way, the file's keys are kept on this ` +
        "device as old keys and its comparisons are added. Use the file's key only if you know " +
        "this device's key shouldn't be used."
    );
};

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
    const [pendingLoad, setPendingLoad] = useState<PendingLoad | null>(null);
    const [replaced, setReplaced] = useState(false);
    // The server's current key for this account, with the fingerprint this
    // device computed from it: the screen never shows the server's stated one.
    const [serverKey, setServerKey] = useState<{
        identity: ReleaseIdentity;
        fingerprint: string | null;
    } | null>(null);

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
        const identity = me?.current?.identity;
        if (!me || !identity) {
            setServerKey(null);
            return undefined;
        }
        void verifyReleaseIdentity(identity, { accountId: me.accountId }).then((check) => {
            if (!cancelled) {
                setServerKey({ identity, fingerprint: check.ok ? check.fingerprint : null });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [me]);

    /** The server's current key, as this device computed its fingerprint. */
    const serverKeyChecked =
        serverKey !== null &&
        me?.current != null &&
        sameIdentity(serverKey.identity, me.current.identity);
    const serverKeyInvalid = serverKeyChecked && serverKey?.fingerprint === null;
    const serverKeyText =
        serverKeyChecked && serverKey?.fingerprint ? shortFingerprint(serverKey.fingerprint) : '…';

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
    // `older`: the server has a key this device made and since replaced, so
    // this device's newer one is not published yet. `foreign`: the server has
    // a key this device did not make, which is either the person's own from
    // another device, or someone else's doing (the independent review's H1).
    const publication: 'published' | 'unpublished' | 'older' | 'foreign' | null = !local
        ? null
        : !me?.current
        ? 'unpublished'
        : sameIdentity(me.current.identity, local.identity)
        ? 'published'
        : device?.keySets.some(
              (set) => me.current !== null && sameIdentity(set.identity, me.current.identity)
          )
        ? 'older'
        : 'foreign';
    // H1: the API refuses an identity it has seen before, so a key the server
    // lists as replaced cannot be published again from here. Identities are
    // compared, never the fingerprints the server states.
    const replacedOnServer =
        local !== undefined &&
        (me?.superseded ?? []).some((entry) => sameIdentity(entry.identity, local.identity));
    const serverName = me?.matrixId?.slice(me.matrixId.indexOf(':') + 1) ?? 'this server';

    const publish = useCallback(
        async (intended: StoredReleaseKeySet) => {
            // N1 of the re-check: publish what the store holds as current now,
            // never a copy this tab kept. A key set the store has since
            // replaced, or removed, is refused, so a stale tab cannot retire a
            // newer key by publishing an older one the server never saw.
            let stored: DeviceReleaseKeys | null;
            try {
                stored = await store.load(intended.identity.accountId);
            } catch (cause) {
                setNotice({
                    tone: 'error',
                    text: `Nothing was published: this device's release keys could not be read: ${errorText(
                        cause
                    )}`,
                });
                return;
            }
            const keySet = currentKeySet(stored);
            if (!keySet || !sameIdentity(keySet.identity, intended.identity)) {
                setDevice(stored);
                setNotice({ tone: 'error', text: CHANGED_ELSEWHERE_NOT_PUBLISHED });
                try {
                    setMe(await actions.getMine());
                } catch {
                    // Keep what the screen had.
                }
                return;
            }
            try {
                setMe(await actions.publishMine(keySet.identity));
                setNotice({
                    tone: 'info',
                    text: "Published: Blackout's server now has this release key for you.",
                });
            } catch (cause) {
                const status = cause instanceof BlackoutSdkError ? cause.status : undefined;
                if (status === 429) {
                    setNotice({ tone: 'error', text: PUBLISH_RATE_LIMITED });
                    return;
                }
                if (status === 409) {
                    // Reused or over the storage bound: the server's own list
                    // tells which, once it is read again.
                    let entry: ReleaseIdentityDirectoryEntry | null = null;
                    try {
                        entry = await actions.getMine();
                        setMe(entry);
                    } catch {
                        // Keep what the screen had.
                    }
                    const reused = (entry?.superseded ?? []).some((superseded) =>
                        sameIdentity(superseded.identity, keySet.identity)
                    );
                    setNotice({
                        tone: 'error',
                        text: reused || !entry ? PUBLISH_REUSED : PUBLISH_STORAGE_LIMIT,
                    });
                    return;
                }
                setNotice({
                    tone: 'error',
                    text: `Your keys are on this device, but publishing them failed: ${errorText(
                        cause
                    )}`,
                });
            }
        },
        [actions, store]
    );

    const createKeys = async () => {
        if (!me) return;
        const replacing = Boolean(currentKeySet(device) || me.current);
        setConfirming(null);
        setBusy('create');
        setNotice(null);
        try {
            const keySet = await createReleaseKeySet(me.accountId, now());
            // Built from what is stored now, not from this tab's copy, so keys
            // another tab made meanwhile are kept as old keys, not lost.
            const next = await store.update(me.accountId, (stored) =>
                withNewCurrentKeySet(stored, me.accountId, keySet, now())
            );
            setDevice(next);
            setComparing({ status: 'idle' });
            const created = currentKeySet(next);
            if (created) await publish(created);
            if (replacing) setReplaced(true);
        } catch (cause) {
            setNotice({ tone: 'error', text: `Creating release keys failed: ${errorText(cause)}` });
        } finally {
            setBusy(null);
        }
    };

    const publishNow = async () => {
        const shown = currentKeySet(device);
        if (!shown) return;
        setBusy('publish');
        try {
            await publish(shown);
        } finally {
            setBusy(null);
        }
    };

    const removeKeys = async () => {
        if (!me) return;
        setConfirming(null);
        setBusy('remove');
        try {
            // Only the record this tab showed: keys another tab made or loaded
            // meanwhile are not deleted unseen.
            if (!(await store.remove(me.accountId, device))) {
                setDevice(await store.load(me.accountId));
                setNotice({ tone: 'error', text: CHANGED_ELSEWHERE_NOT_REMOVED });
                return;
            }
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
            // N3 of the re-check: what the store holds now, not this tab's
            // copy, which another tab may have changed or the panic wipe
            // emptied.
            const stored = await store.load(device.accountId);
            const changed = !sameDeviceRecord(stored, device);
            setDevice(stored);
            if (!stored) {
                setNotice({ tone: 'error', text: NO_KEYS_TO_SAVE });
                return;
            }
            const text = await writeRecoveryFile(
                toRecoveryContents(stored, now()),
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
                    'saved, and keep it somewhere other than this device.' +
                    (changed ? ` ${SAVED_STORED_KEYS}` : ''),
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
            // The server's keys as identities: its stated fingerprints are
            // never trusted for this (the re-check).
            const server = {
                current: me.current?.identity ?? null,
                superseded: me.superseded.map((entry) => entry.identity),
            };
            // Decided against what is stored now, in the same transaction as
            // the write. A file whose key is older, was replaced, or is known
            // to nobody does not replace this device's key without asking.
            const asked: { plan?: AskPlan } = {};
            const next = await store.update(me.accountId, (stored) => {
                const plan = planRecoveryLoad(stored, contents, server);
                if (plan.kind === 'ask') {
                    asked.plan = plan;
                    return undefined;
                }
                return mergeRecoveryContents(
                    stored,
                    contents,
                    now(),
                    plan.kind === 'adopt' ? 'file' : 'device'
                );
            });
            setLoadPassphrase('');
            setLoadText(null);
            if (asked.plan) {
                const filePlan = asked.plan;
                setPendingLoad({
                    contents,
                    plan: filePlan,
                    replacedOnServer: server.superseded.some((identity) =>
                        sameIdentity(identity, filePlan.file.identity)
                    ),
                });
                return;
            }
            setDevice(next);
            setComparing({ status: 'idle' });
            setNotice({ tone: 'info', text: 'Loaded your release keys from the recovery file.' });
        } catch (cause) {
            setNotice({ tone: 'error', text: recoveryErrorText(cause) });
        } finally {
            setBusy(null);
            setProgress(null);
        }
    };

    const finishLoad = async (choice: RecoveryCurrentChoice) => {
        if (!me || !pendingLoad) return;
        const { contents } = pendingLoad;
        setPendingLoad(null);
        setBusy('load');
        try {
            const next = await store.update(me.accountId, (stored) =>
                mergeRecoveryContents(stored, contents, now(), choice)
            );
            setDevice(next);
            setComparing({ status: 'idle' });
            setNotice({
                tone: 'info',
                text:
                    choice === 'device'
                        ? "Loaded the recovery file's keys as old keys, and its comparisons. This device's key stays your current key."
                        : "Loaded your release keys from the recovery file. The file's key is now this device's current key.",
            });
        } catch (cause) {
            setNotice({ tone: 'error', text: errorText(cause) });
        } finally {
            setBusy(null);
        }
    };

    const lookUp = async () => {
        const matrixId = compareInput.trim();
        if (!me || !local || matrixId.length === 0) return;
        setComparing({ status: 'looking' });
        try {
            const entry = await actions.lookupByMatrixId(matrixId);
            // L3: the answer must be for the Matrix id typed, which is also
            // the one recorded with the comparison.
            if (entry.matrixId !== matrixId) {
                setComparing({ status: 'mismatch', typed: matrixId, answered: entry.matrixId });
                return;
            }
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
                matrixId,
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
        if (comparing.status !== 'code' || !device || !local || !me) return;
        const at = now();
        const comparison = {
            accountId: comparing.accountId,
            matrixId: comparing.matrixId,
            fingerprint: comparing.fingerprint,
            ownFingerprint: local.fingerprint,
            comparedAt: at.toISOString(),
        };
        try {
            // Added to what is stored now: a key set another tab made or
            // removed meanwhile is neither lost nor brought back.
            const next = await store.update(me.accountId, (stored) =>
                stored ? withComparison(stored, comparison, at) : undefined
            );
            setDevice(next);
            if (!next) {
                // The compare section goes with the keys, so say it up top.
                setComparing({ status: 'idle' });
                setNotice({ tone: 'error', text: CHANGED_ELSEWHERE_NOT_RECORDED });
                return;
            }
            setComparing({ status: 'recorded', matrixId: comparing.matrixId });
            if (currentKeySet(next)?.fingerprint !== local.fingerprint) {
                setNotice({ tone: 'info', text: COMPARED_WITH_OLD_KEY });
            }
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
                                    {publication === 'older' && me.current && replacedOnServer && (
                                        <p data-testid="publication" role="alert">
                                            {rolledBackWarning(serverKeyText)}
                                        </p>
                                    )}
                                    {publication === 'older' && me.current && !replacedOnServer && (
                                        <p data-testid="publication">
                                            Not published yet: Blackout&apos;s server still has the
                                            key this device used before ({serverKeyText}).
                                            Publishing this device&apos;s key replaces it, and
                                            anyone who compared a code with you would have to
                                            compare again.
                                        </p>
                                    )}
                                    {publication === 'foreign' && me.current && (
                                        <p data-testid="publication" role="alert">
                                            {serverKeyInvalid
                                                ? INVALID_SERVER_KEY_WARNING
                                                : foreignKeyWarning(serverKeyText)}
                                        </p>
                                    )}
                                    {publication !== 'published' && replacedOnServer && (
                                        <p data-testid="replaced-on-server">
                                            {RELEASE_KEY_REPLACED_ON_SERVER}
                                        </p>
                                    )}
                                    {publication !== 'published' && !replacedOnServer && (
                                        <>
                                            {publication === 'foreign' && (
                                                <p>{FOREIGN_KEY_PUBLISH_NOTE}</p>
                                            )}
                                            <button
                                                type="button"
                                                disabled={working}
                                                onClick={() => void publishNow()}
                                            >
                                                Publish this device&apos;s key
                                            </button>
                                        </>
                                    )}
                                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                        <button
                                            type="button"
                                            disabled={working}
                                            onClick={() => setConfirming('replace')}
                                        >
                                            Create and publish new release keys
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
                                        <>
                                            <p data-testid="publication" role="alert">
                                                {serverKeyInvalid
                                                    ? INVALID_SERVER_KEY_WARNING
                                                    : missingKeysWarning(serverKeyText)}
                                            </p>
                                            <p>
                                                Creating new keys replaces them, and anyone who
                                                compared a code with you would have to compare
                                                again.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p>You have no release keys yet.</p>
                                            <p>{RELEASE_KEYS_LISTING}</p>
                                        </>
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
                                            ? 'Create and publish new release keys'
                                            : 'Create and publish release keys'}
                                    </button>
                                </>
                            )}
                            {replaced && confirming === null && (
                                <p role="status" data-testid="replace-guidance">
                                    {RELEASE_KEYS_REPLACE_GUIDANCE}
                                </p>
                            )}
                            {confirming === 'replace' && (
                                <div
                                    role="group"
                                    aria-label="Confirm new keys"
                                    style={sectionStyle}
                                >
                                    <p>
                                        New keys are published at once and replace your current ones
                                        for everyone who looks you up, and anyone who compared a
                                        code with you would have to compare again.
                                        {local
                                            ? ' Your current keys stay on this device as old keys.'
                                            : ''}{' '}
                                        Replaced keys stay listed on the server until your account
                                        is deleted.
                                    </p>
                                    <p>{RELEASE_KEYS_REPLACE_GUIDANCE}</p>
                                    <button type="button" onClick={() => void createKeys()}>
                                        Create and publish new keys
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
                            <p>{RECOVERY_PASSPHRASE_DONT_SAVE}</p>
                            {local && (
                                <>
                                    <p>{RECOVERY_SAVE_NOTE}</p>
                                    <label style={{ display: 'block' }}>
                                        Passphrase{' '}
                                        <input
                                            type="password"
                                            autoComplete="off"
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
                                            autoComplete="off"
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
                                To load one, choose the file and enter its passphrase. Its keys are
                                kept on this device and its comparisons are added. Its current key
                                becomes this device&apos;s current key only if this device has none,
                                or the file&apos;s is newer and wasn&apos;t replaced; otherwise you
                                are asked first.
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
                                    autoComplete="off"
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
                            {pendingLoad && (
                                <div
                                    role="group"
                                    aria-label="Confirm which key to use"
                                    style={sectionStyle}
                                >
                                    <p>
                                        {recoveryLoadQuestion(
                                            pendingLoad,
                                            (keySet) =>
                                                `${shortFingerprint(
                                                    keySet.fingerprint
                                                )}, created ${formatLocalTime(keySet.createdAt)}`
                                        )}
                                    </p>
                                    <button type="button" onClick={() => void finishLoad('device')}>
                                        Keep this device&apos;s key
                                    </button>{' '}
                                    <button type="button" onClick={() => void finishLoad('file')}>
                                        Use the file&apos;s key
                                    </button>{' '}
                                    <button type="button" onClick={() => setPendingLoad(null)}>
                                        Don&apos;t load the file
                                    </button>
                                </div>
                            )}
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
                                        {comparing.status === 'mismatch' && (
                                            <p role="alert">
                                                {lookupMismatch(
                                                    comparing.typed,
                                                    comparing.answered
                                                )}
                                            </p>
                                        )}
                                        {comparing.status === 'error' && (
                                            <p role="alert">{comparing.text}</p>
                                        )}
                                        {comparing.status === 'code' && (
                                            <div data-testid="safety-code">
                                                <p>{compareHow(comparing.matrixId)}</p>
                                                <p>{COMPARE_READ_ALL}</p>
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
