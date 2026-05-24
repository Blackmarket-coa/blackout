import React, {
    FormEventHandler,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Overlay,
    OverlayBackdrop,
    OverlayCenter,
    Box,
    Header,
    config,
    Text,
    IconButton,
    Icon,
    Icons,
    Input,
    Button,
    Spinner,
    color,
    Dialog,
    Scroll,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '../../utils/keyboard';
import { BreakWord } from '../../styles/Text.css';
import { useTimeoutToggle } from '../../hooks/useTimeoutToggle';
import { useConfirm } from '../confirm-dialog/useConfirm';
import {
    CreateInvitationResponse,
    InvitationWithRedemptions,
    createInvitation,
    getBotUserId,
    listMyInvitations,
    revokeInvitation,
} from '../../features/invitations/invitationsClient';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useAtomValue } from 'jotai';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { resolveParentSpace } from '../invite-landing/postAcceptanceRoute';

type InvitationsManagerProps = {
    /** Pre-fills the "scope to this room" field when invoked from a room. */
    roomId?: string;
    requestClose: () => void;
};

type LoadStatus =
    | { kind: 'loading' }
    | { kind: 'loaded'; items: InvitationWithRedemptions[] }
    | { kind: 'error'; message: string };

type CreateStatus =
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'created'; response: CreateInvitationResponse }
    | { kind: 'error'; message: string };

const formatExpiry = (iso?: string): string =>
    iso ? new Date(iso).toLocaleString() : 'never';

const formatRedeemedAt = (iso: string): string => new Date(iso).toLocaleString();

const linkRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S200,
    flexWrap: 'wrap',
};

export function InvitationsManager({ roomId, requestClose }: InvitationsManagerProps) {
    const mx = useMatrixClient();
    const roomToParents = useAtomValue(roomToParentsAtom);
    const confirm = useConfirm();
    const [load, setLoad] = useState<LoadStatus>({ kind: 'loading' });
    const [create, setCreate] = useState<CreateStatus>({ kind: 'idle' });
    const [scopeToRoom, setScopeToRoom] = useState<boolean>(Boolean(roomId));
    const [copied, triggerCopied] = useTimeoutToggle();

    const refresh = useCallback(async () => {
        setLoad({ kind: 'loading' });
        try {
            const { invitations } = await listMyInvitations();
            setLoad({ kind: 'loaded', items: invitations });
        } catch {
            setLoad({
                kind: 'error',
                message:
                    'Could not load your invite links. The invitations service may be unavailable.',
            });
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const handleSubmit: FormEventHandler<HTMLFormElement> = async (evt) => {
        evt.preventDefault();
        const form = evt.currentTarget;
        const fd = new FormData(form);
        const label = (fd.get('label') as string | null)?.trim() || undefined;
        const maxUsesRaw = Number(fd.get('maxUses'));
        const expiresInHoursRaw = Number(fd.get('expiresInHours'));

        const targetRoom = scopeToRoom && roomId ? roomId : undefined;

        setCreate({ kind: 'submitting' });
        try {
            // For a room-scoped link, invite the BlackOut bot into the CANOPY
            // (the den's parent space). Dens are `restricted` to their canopy,
            // so the bot must be a canopy member to admit redeemers — adding it
            // to the den alone doesn't satisfy the restricted rule. Only the
            // creator (here) can add the bot to the invite-only canopy; the
            // server then force-joins it. Falls back to the den when there's no
            // canopy. Best-effort — the bot may already be a member/invited.
            if (targetRoom) {
                try {
                    const { userId } = await getBotUserId();
                    if (userId) {
                        const canopyId = resolveParentSpace(mx, roomToParents, targetRoom);
                        await mx.invite(canopyId ?? targetRoom, userId);
                    }
                } catch {
                    /* bot already in/invited, or invite raced; server force-join is the net */
                }
            }
            const response = await createInvitation({
                matrixRoomId: targetRoom,
                label,
                maxUses: Number.isFinite(maxUsesRaw) && maxUsesRaw > 0 ? maxUsesRaw : 1,
                expiresInHours:
                    Number.isFinite(expiresInHoursRaw) && expiresInHoursRaw >= 0
                        ? expiresInHoursRaw
                        : 168,
            });
            setCreate({ kind: 'created', response });
            void refresh();
            form.reset();
        } catch (err) {
            const raw = err instanceof Error ? err.message : '';
            const friendly =
                /not valid JSON|Unexpected token|HTTP_BAD_RESPONSE/i.test(raw)
                    ? 'Could not create invitation. The invitations service may be unavailable.'
                    : raw || 'Could not create invitation.';
            setCreate({ kind: 'error', message: friendly });
        }
    };

    const copyText = useCallback(
        async (text: string) => {
            try {
                await navigator.clipboard.writeText(text);
                triggerCopied();
            } catch {
                // Clipboard API can be blocked in insecure contexts; the URL
                // is still selectable on screen.
            }
        },
        [triggerCopied],
    );

    const requestRevoke = useCallback(
        async (item: InvitationWithRedemptions) => {
            await confirm({
                title: 'Revoke this invitation?',
                description:
                    'The link will stop working immediately. Anyone who has not yet used it will see an error message.',
                confirmLabel: 'Revoke',
                variant: 'Critical',
                onConfirm: async () => {
                    await revokeInvitation(item.id);
                    await refresh();
                },
            });
        },
        [confirm, refresh],
    );

    const rows = load.kind === 'loaded' ? load.items : [];

    const created = create.kind === 'created' ? create.response : null;

    // Auto-copy the one-time URL the first time a creation succeeds. The
    // ref guards against repeat-firing if the component re-renders with the
    // same `created` value (e.g., parent state churn). Manual re-copy via
    // the Copy button still works through the same `copyText` callback.
    const autoCopiedUrlRef = useRef<string | null>(null);
    useEffect(() => {
        if (!created) return;
        if (autoCopiedUrlRef.current === created.url) return;
        autoCopiedUrlRef.current = created.url;
        void copyText(created.url);
    }, [created, copyText]);

    const showScopeToggle = useMemo(() => Boolean(roomId), [roomId]);

    return (
        <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
                <FocusTrap
                    focusTrapOptions={{
                        clickOutsideDeactivates: true,
                        onDeactivate: requestClose,
                        escapeDeactivates: stopPropagation,
                    }}
                >
                    <Dialog>
                        <Box grow="Yes" direction="Column">
                            <Header
                                size="500"
                                style={{ padding: `0 ${config.space.S200} 0 ${config.space.S400}` }}
                            >
                                <Box grow="Yes">
                                    <Text size="H4" truncate>
                                        Shareable invite links
                                    </Text>
                                </Box>
                                <Box shrink="No">
                                    <IconButton size="300" radii="300" onClick={requestClose}>
                                        <Icon src={Icons.Cross} />
                                    </IconButton>
                                </Box>
                            </Header>

                            <Scroll size="300" style={{ maxHeight: '70vh' }}>
                                <Box
                                    direction="Column"
                                    style={{ padding: config.space.S400 }}
                                    gap="400"
                                >
                                    <Box
                                        as="form"
                                        onSubmit={handleSubmit}
                                        shrink="No"
                                        direction="Column"
                                        gap="300"
                                    >
                                        <Text size="L400">Create a link</Text>
                                        <Box direction="Column" gap="100">
                                            <Text size="T200">Label (optional)</Text>
                                            <Input
                                                size="400"
                                                name="label"
                                                placeholder="e.g. launch crew"
                                                variant="Background"
                                                autoComplete="off"
                                                disabled={create.kind === 'submitting'}
                                            />
                                        </Box>
                                        <Box direction="Row" gap="200">
                                            <Box direction="Column" gap="100" grow="Yes">
                                                <Text size="T200">Max uses</Text>
                                                <Input
                                                    size="400"
                                                    name="maxUses"
                                                    type="number"
                                                    min={1}
                                                    max={1000}
                                                    defaultValue={1}
                                                    variant="Background"
                                                    disabled={create.kind === 'submitting'}
                                                />
                                            </Box>
                                            <Box direction="Column" gap="100" grow="Yes">
                                                <Text size="T200">Expires in (hours, 0 = never)</Text>
                                                <Input
                                                    size="400"
                                                    name="expiresInHours"
                                                    type="number"
                                                    min={0}
                                                    defaultValue={168}
                                                    variant="Background"
                                                    disabled={create.kind === 'submitting'}
                                                />
                                            </Box>
                                        </Box>
                                        {showScopeToggle && (
                                            <Box as="label" alignItems="Center" gap="200">
                                                <input
                                                    type="checkbox"
                                                    checked={scopeToRoom}
                                                    onChange={(e) => setScopeToRoom(e.target.checked)}
                                                    disabled={create.kind === 'submitting'}
                                                />
                                                <Text size="T300">
                                                    Auto-invite redeemers to this room
                                                </Text>
                                            </Box>
                                        )}
                                        {create.kind === 'error' && (
                                            <Text
                                                size="T200"
                                                style={{ color: color.Critical.Main }}
                                                className={BreakWord}
                                            >
                                                <b>{create.message}</b>
                                            </Text>
                                        )}
                                        <Button
                                            type="submit"
                                            disabled={create.kind === 'submitting'}
                                            before={
                                                create.kind === 'submitting' && (
                                                    <Spinner size="200" variant="Primary" fill="Solid" />
                                                )
                                            }
                                        >
                                            <Text size="B400">Create link</Text>
                                        </Button>
                                    </Box>

                                    {created && (
                                        <Box
                                            direction="Column"
                                            gap="200"
                                            style={{
                                                padding: config.space.S300,
                                                background: 'var(--bg-input, #0f172a)',
                                                borderRadius: 8,
                                            }}
                                        >
                                            <Text size="L400">Your invite link</Text>
                                            <Text
                                                size="T200"
                                                className={BreakWord}
                                                style={{
                                                    fontFamily: 'monospace',
                                                    userSelect: 'all',
                                                }}
                                            >
                                                {created.url}
                                            </Text>
                                            <Box gap="200" style={linkRow}>
                                                <Button
                                                    size="300"
                                                    type="button"
                                                    onClick={() => void copyText(created.url)}
                                                >
                                                    <Text size="B300">
                                                        {copied ? 'Copied!' : 'Copy link'}
                                                    </Text>
                                                </Button>
                                                <Text size="T200" style={{ opacity: 0.7 }}>
                                                    This URL is shown once. Save it now.
                                                </Text>
                                            </Box>
                                        </Box>
                                    )}

                                    <Box direction="Column" gap="200">
                                        <Text size="L400">Your active links</Text>
                                        {load.kind === 'loading' && (
                                            <Text size="T200">Loading…</Text>
                                        )}
                                        {load.kind === 'error' && (
                                            <Text
                                                size="T200"
                                                style={{ color: color.Critical.Main }}
                                            >
                                                {load.message}
                                            </Text>
                                        )}
                                        {load.kind === 'loaded' && rows.length === 0 && (
                                            <Text size="T200" style={{ opacity: 0.7 }}>
                                                You haven&apos;t created any invite links yet.
                                            </Text>
                                        )}
                                        {rows.map((item) => {
                                            const revoked = Boolean(item.revokedAt);
                                            return (
                                                <Box
                                                    key={item.id}
                                                    direction="Column"
                                                    gap="100"
                                                    style={{
                                                        padding: config.space.S300,
                                                        border: '1px solid var(--border-default, #374151)',
                                                        borderRadius: 8,
                                                        opacity: revoked ? 0.6 : 1,
                                                    }}
                                                >
                                                    <Box style={linkRow}>
                                                        <Text size="T300">
                                                            <b>{item.label ?? '(no label)'}</b>
                                                        </Text>
                                                        {item.matrixRoomId && (
                                                            <Text size="T200" style={{ opacity: 0.7 }}>
                                                                · room: {item.matrixRoomId}
                                                            </Text>
                                                        )}
                                                    </Box>
                                                    <Text size="T200" style={{ opacity: 0.7 }}>
                                                        {item.useCount}/{item.maxUses} used ·{' '}
                                                        {item.usesRemaining} left · expires{' '}
                                                        {formatExpiry(item.expiresAt)}
                                                        {revoked ? ' · revoked' : ''}
                                                    </Text>
                                                    {item.redemptions.length > 0 && (
                                                        <Box direction="Column" gap="100">
                                                            <Text size="T200" style={{ opacity: 0.7 }}>
                                                                Redemptions: {item.redemptions.length}
                                                            </Text>
                                                            {item.redemptions.map((red) => (
                                                                <Text
                                                                    key={`${red.userId}-${red.at}`}
                                                                    size="T200"
                                                                    style={{ opacity: 0.7 }}
                                                                >
                                                                    @{red.username} ·{' '}
                                                                    {formatRedeemedAt(red.at)}
                                                                </Text>
                                                            ))}
                                                        </Box>
                                                    )}
                                                    {!revoked && (
                                                        <Box gap="200" style={linkRow}>
                                                            <Button
                                                                size="300"
                                                                type="button"
                                                                variant="Critical"
                                                                onClick={() =>
                                                                    void requestRevoke(item)
                                                                }
                                                            >
                                                                <Text size="B300">Revoke</Text>
                                                            </Button>
                                                        </Box>
                                                    )}
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </Box>
                            </Scroll>
                        </Box>
                    </Dialog>
                </FocusTrap>
            </OverlayCenter>
        </Overlay>
    );
}

export default InvitationsManager;
