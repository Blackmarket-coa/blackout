import React, { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import {
    Box,
    Button,
    Dialog,
    Header,
    Icon,
    IconButton,
    Icons,
    Overlay,
    OverlayBackdrop,
    OverlayCenter,
    Text,
    config,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import type { MatrixClient } from 'matrix-js-sdk';
import { useAlive } from '../hooks/useAlive';
import {
    accountKeyVerdict,
    checkAccountKeyState,
    type AccountKeyVerdict,
} from '../../client/keyBackupCheck';
import { DeviceVerificationReset, DeviceVerificationSetup } from './DeviceVerificationSetup';

/**
 * The click-time half of the key-backup guard (S9,
 * `docs/security/key-backup-nudge-2026-11-02.md`), shared by the key-backup
 * nudge, the undecryptable-message chip and the legacy Devices page's Enable
 * button.
 *
 * A verdict a screen shows can be hours old. A screen refreshes it on
 * `KeyBackupStatus`, which the SDK emits only when THIS device enables or
 * disables backup (matrix-js-sdk 40.2.0, `lib/rust-crypto/backup.js`,
 * `enableKeyBackup` and `disableKeyBackup`). The SDK's own re-checks of the
 * backup (forced at start-up, on the user's own identity update, after an
 * upload failure, after this device's own `resetKeyBackup` and when the app
 * calls `checkKeyBackupAndEnable`, which Blackout never does; unforced until a
 * check first succeeds) enable nothing on a device that trusts neither the
 * account's identity nor a backup signed by it, so there they emit nothing.
 * Another device of the account can create cross-signing and a backup while
 * the screen sits open, and nothing refreshes the screen. So no entry opens the
 * from-scratch setup from a stored verdict: `open()` asks the homeserver again
 * at the click, with the overlay already up in a checking state, and only the
 * answer to the latest click opens a flow: a `'none'` opens
 * `DeviceVerificationSetup`; a `'cross_signing'` that this device trusts opens
 * the warned `DeviceVerificationReset`; every other answer shows the caller's
 * text for that row, with Close. An answer to an earlier click, or to a click
 * whose overlay was closed, is dropped when it arrives (`useAnswerTurns`), so
 * a late "none" never replaces a later answer or reopens a closed overlay. A
 * caller whose own surface does not explain rows 1 and 2 (the chip) passes
 * `texts.offer`: those rows then show that text first, with a "Set up backup"
 * button that asks the homeserver once more before it opens the flow. The
 * setup form then checks once more right before its first write
 * (`SetupVerification`), which closes the window between the last of these
 * checks and the submit.
 */

export type KeyBackupGuardPanel =
    | 'checking'
    | 'setup'
    | 'reset'
    | 'offer_setup'
    | 'offer_reset'
    | 'backup'
    | 'not_verified'
    | 'check_failed';

/** The caller's text for the wait and for the rows that open no flow. */
export interface KeyBackupGuardTexts {
    checking: string;
    backup: string;
    not_verified: string;
    check_failed: string;
    /**
     * Set by a caller whose own surface does not say what the setup (row 1)
     * or the reset (row 2) does (the chip): the overlay shows this text first,
     * with a "Set up backup" button that re-asks the homeserver before it
     * opens the flow. Left out by a caller that already shows the row's text
     * (the nudge's banner), so the fresh answer opens the flow at once.
     */
    offer?: { setup: string; reset: string };
}

export interface KeyBackupGuardResult {
    verdict: AccountKeyVerdict;
    /** Whether THIS device trusts the account's cross-signing. */
    crossSigningReady: boolean;
    panel: KeyBackupGuardPanel;
}

export const panelForVerdict = (
    verdict: AccountKeyVerdict,
    crossSigningReady: boolean
): KeyBackupGuardPanel => {
    switch (verdict) {
        case 'none':
            return 'setup';
        case 'cross_signing':
            return crossSigningReady ? 'reset' : 'not_verified';
        case 'backup':
            return 'backup';
        case 'unknown':
        default:
            return 'check_failed';
    }
};

/** Rows 1 and 2 shown as an explanation with a button, for `texts.offer`. */
const offerFirst = (panel: KeyBackupGuardPanel): KeyBackupGuardPanel => {
    if (panel === 'setup') return 'offer_setup';
    if (panel === 'reset') return 'offer_reset';
    return panel;
};

const CHECK_FAILED: KeyBackupGuardResult = {
    verdict: 'unknown',
    crossSigningReady: false,
    panel: 'check_failed',
};

/**
 * The guard's inputs, fetched now: the homeserver's answer about the account
 * (`checkAccountKeyState`, which never throws) and this device's trust in the
 * account's cross-signing. Never throws: a device check that rejects (the
 * crypto layer closed during sign-out, say) makes the verdict `'unknown'`,
 * which offers nothing.
 */
export const checkForSetup = async (mx: MatrixClient): Promise<KeyBackupGuardResult> => {
    try {
        const crypto = mx.getCrypto();
        const [state, crossSigningReady] = await Promise.all([
            checkAccountKeyState(mx),
            crypto ? crypto.isCrossSigningReady() : Promise.resolve(false),
        ]);
        const verdict = accountKeyVerdict(state, crossSigningReady);
        return { verdict, crossSigningReady, panel: panelForVerdict(verdict, crossSigningReady) };
    } catch {
        return CHECK_FAILED;
    }
};

export interface AnswerTurns {
    /** Takes a turn when a check starts. */
    next: () => number;
    /** True until a later turn is taken. */
    isLatest: (turn: number) => boolean;
}

/**
 * Orders answers that can arrive out of order. Each check takes a turn when
 * it starts; an answer whose turn is no longer the latest was asked for
 * before another one, so the caller drops it rather than let it overwrite
 * a fresher answer. Closing an overlay takes a turn too, so an answer that
 * arrives after the close is dropped.
 */
export function useAnswerTurns(): AnswerTurns {
    const latest = useRef(0);
    return useMemo(
        () => ({
            next: () => {
                latest.current += 1;
                return latest.current;
            },
            isLatest: (turn: number) => turn === latest.current,
        }),
        []
    );
}

export interface KeyBackupSetupGuard {
    panel: KeyBackupGuardPanel | null;
    texts: KeyBackupGuardTexts;
    /**
     * Runs the check and drives `panel`. Resolves with the fresh answer, so
     * the caller can update what it shows too (a button the answer removed
     * should be gone), or null when the answer was dropped: the component
     * unmounted, or a later click or a close came first.
     */
    open: () => Promise<KeyBackupGuardResult | null>;
    /** The offer panel's "Set up backup": checks again, then opens the flow. */
    proceed: () => Promise<KeyBackupGuardResult | null>;
    close: () => void;
}

export function useKeyBackupSetupGuard(
    mx: MatrixClient | null,
    texts: KeyBackupGuardTexts
): KeyBackupSetupGuard {
    const alive = useAlive();
    const turns = useAnswerTurns();
    const [panel, setPanel] = useState<KeyBackupGuardPanel | null>(null);
    const explainFirst = texts.offer !== undefined;

    const check = useCallback(
        async (explain: boolean): Promise<KeyBackupGuardResult | null> => {
            if (!mx) return null;
            const turn = turns.next();
            setPanel('checking');
            const result = await checkForSetup(mx);
            if (!alive() || !turns.isLatest(turn)) return null;
            const shown = explain ? offerFirst(result.panel) : result.panel;
            setPanel(shown);
            return { ...result, panel: shown };
        },
        [mx, alive, turns]
    );

    const open = useCallback(() => check(explainFirst), [check, explainFirst]);
    const proceed = useCallback(() => check(false), [check]);
    const close = useCallback(() => {
        turns.next();
        setPanel(null);
    }, [turns]);

    return { panel, texts, open, proceed, close };
}

/** The guard's button label in the offer panels, the same as the nudge's. */
export const KEY_BACKUP_GUARD_PROCEED_LABEL = 'Set up backup';

type KeyBackupExplanationProps = {
    text: string;
    onClose: () => void;
    /** A button beside Close (the offer panels' "Set up backup"). */
    action?: { label: string; onClick: () => void };
};

/**
 * Forwards its ref to the `Dialog`, as `DeviceVerificationSetup` does:
 * `KeyBackupGuardOverlay` wraps it in `FocusTrap`, which finds its container
 * through that ref. A function component without `forwardRef` drops the ref,
 * so the trap had no container and Tab could leave the overlay.
 */
export const KeyBackupExplanation = forwardRef<HTMLDivElement, KeyBackupExplanationProps>(
    ({ text, onClose, action }, ref) => (
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
                    <Text size="H4">Key backup</Text>
                </Box>
                <IconButton size="300" radii="300" onClick={onClose} aria-label="Close">
                    <Icon src={Icons.Cross} />
                </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                <Text size="T300">{text}</Text>
                {action && (
                    <Button variant="Primary" onClick={action.onClick}>
                        <Text size="B400">{action.label}</Text>
                    </Button>
                )}
                <Button variant="Secondary" fill="Soft" onClick={onClose}>
                    <Text size="B400">Close</Text>
                </Button>
            </Box>
        </Dialog>
    )
);

/**
 * Ends a click inside the overlay there. Folds' `Overlay` portals its content
 * out of the caller's DOM, but React still bubbles the portal's events up the
 * component tree, through whatever renders the overlay. The chip renders it
 * inside a reply preview (`Reply`), which is a button whose click opens the
 * replied message and closes the search panel (message-search results are
 * the only place the shipped app shows the chip); without this, every click
 * in the overlay reached that handler too (eighth review).
 */
const stopClick = (event: React.MouseEvent) => {
    event.stopPropagation();
};

/**
 * The overlay for `useKeyBackupSetupGuard`: the setup, the reset, an offer
 * (the row's text and "Set up backup"), or the caller's text for the row.
 * Rendered whenever `panel` is set, independent of whatever else the caller
 * shows, so a setup that is under way (the recovery key on screen) stays up
 * when the caller's own banner goes away. It goes away with the component
 * that renders it (the chip's host going with the screen, or the search
 * results shifting under the chip, say); an attempt that is writing
 * then runs on and its key is shown by `RecoveryKeyHandoffHost`.
 */
export function KeyBackupGuardOverlay({ guard }: { guard: KeyBackupSetupGuard }) {
    const { panel, texts, close, proceed } = guard;
    if (!panel) return null;

    let body: React.ReactNode;
    if (panel === 'setup') {
        body = <DeviceVerificationSetup onCancel={close} />;
    } else if (panel === 'reset') {
        body = <DeviceVerificationReset onCancel={close} />;
    } else if (panel === 'offer_setup' || panel === 'offer_reset') {
        const text = panel === 'offer_setup' ? texts.offer?.setup : texts.offer?.reset;
        // An offer panel comes only from `texts.offer`; without it, say
        // nothing was checked rather than offer a flow with no explanation.
        body = text ? (
            <KeyBackupExplanation
                text={text}
                onClose={close}
                action={{
                    label: KEY_BACKUP_GUARD_PROCEED_LABEL,
                    onClick: () => void proceed(),
                }}
            />
        ) : (
            <KeyBackupExplanation text={texts.check_failed} onClose={close} />
        );
    } else {
        body = <KeyBackupExplanation text={texts[panel]} onClose={close} />;
    }

    // `FocusTrap` takes its container from the child's ref once, when the trap
    // is created, and keeps it. A child of another component type is a new
    // DOM node, so each type gets its own trap (`key`); the explanation panels
    // share one component, and React keeps its node between them.
    const trapKey = panel === 'setup' || panel === 'reset' ? panel : 'explanation';

    return (
        <Overlay open backdrop={<OverlayBackdrop />} onClick={stopClick}>
            <OverlayCenter>
                <FocusTrap
                    key={trapKey}
                    focusTrapOptions={{
                        initialFocus: false,
                        clickOutsideDeactivates: false,
                        escapeDeactivates: false,
                    }}
                >
                    {body}
                </FocusTrap>
            </OverlayCenter>
        </Overlay>
    );
}
