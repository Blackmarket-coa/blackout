import React, { MouseEventHandler, useCallback, useEffect, useState } from 'react';
import {
    Badge,
    Box,
    Button,
    Chip,
    config,
    Icon,
    Icons,
    Spinner,
    Text,
    Overlay,
    OverlayBackdrop,
    OverlayCenter,
    IconButton,
    RectCords,
    PopOut,
    Menu,
    MenuItem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { CryptoApi, VerificationRequest } from 'matrix-js-sdk/lib/crypto-api';
import { VerificationStatus } from '../../../hooks/useDeviceVerificationStatus';
import { InfoCard } from '../../../components/info-card';
import { ManualVerificationTile } from '../../../components/ManualVerification';
import { SecretStorageKeyContent } from '../../../../types/matrix/accountData';
import { AsyncState, AsyncStatus, useAsync } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { DeviceVerification } from '../../../components/DeviceVerification';
import {
    DeviceVerificationReset,
    DeviceVerificationSetup,
} from '../../../components/DeviceVerificationSetup';
import { stopPropagation } from '../../../utils/keyboard';
import { useAuthMetadata } from '../../../hooks/useAuthMetadata';
import { withSearchParam } from '../../../pages/pathUtils';
import { useAccountManagementActions } from '../../../hooks/useAccountManagement';
import { useAlive } from '../../../hooks/useAlive';
import {
    accountKeyVerdict,
    checkAccountKeyState,
    type AccountKeyVerdict,
} from '../../../../client/keyBackupCheck';

type VerificationStatusBadgeProps = {
    verificationStatus: VerificationStatus;
    otherUnverifiedCount?: number;
};
export function VerificationStatusBadge({
    verificationStatus,
    otherUnverifiedCount,
}: VerificationStatusBadgeProps) {
    if (
        verificationStatus === VerificationStatus.Unknown ||
        typeof otherUnverifiedCount !== 'number'
    ) {
        return <Spinner size="400" variant="Secondary" />;
    }
    if (verificationStatus === VerificationStatus.Unverified) {
        return (
            <Badge variant="Critical" fill="Solid" size="500">
                <Text size="L400">Unverified</Text>
            </Badge>
        );
    }

    if (otherUnverifiedCount > 0) {
        return (
            <Badge variant="Warning" fill="Solid" size="500">
                <Text size="L400">{otherUnverifiedCount} Unverified</Text>
            </Badge>
        );
    }

    return (
        <Badge variant="Success" fill="Solid" size="500">
            <Text size="L400">Verified</Text>
        </Badge>
    );
}

function LearnStartVerificationFromOtherDevice() {
    return (
        <Box direction="Column">
            <Text size="T200">Steps to verify from other device.</Text>
            <Text as="div" size="T200">
                <ul style={{ margin: `${config.space.S100} 0` }}>
                    <li>Open your other verified device.</li>
                    <li>
                        Open <i>Settings</i>.
                    </li>
                    <li>
                        Find this device in <i>Devices/Sessions</i> section.
                    </li>
                    <li>Initiate verification.</li>
                </ul>
            </Text>
            <Text size="T200">
                If you do not have any verified device press the <i>&quot;Verify Manually&quot;</i>{' '}
                button.
            </Text>
        </Box>
    );
}

type VerifyCurrentDeviceTileProps = {
    secretStorageKeyId: string;
    secretStorageKeyContent: SecretStorageKeyContent;
};
export function VerifyCurrentDeviceTile({
    secretStorageKeyId,
    secretStorageKeyContent,
}: VerifyCurrentDeviceTileProps) {
    const [learnMore, setLearnMore] = useState(false);

    const [manualVerification, setManualVerification] = useState(false);
    const handleCancelVerification = () => setManualVerification(false);

    return (
        <>
            <InfoCard
                variant="Critical"
                title="Unverified"
                description={
                    <>
                        Start verification from other device or verify manually.{' '}
                        <Text as="a" size="T200" onClick={() => setLearnMore(!learnMore)}>
                            <b>{learnMore ? 'View Less' : 'Learn More'}</b>
                        </Text>
                    </>
                }
                after={
                    !manualVerification && (
                        <Button
                            size="300"
                            variant="Critical"
                            fill="Soft"
                            radii="300"
                            outlined
                            onClick={() => setManualVerification(true)}
                        >
                            <Text as="span" size="B300">
                                Verify Manually
                            </Text>
                        </Button>
                    )
                }
            >
                {learnMore && <LearnStartVerificationFromOtherDevice />}
            </InfoCard>
            {manualVerification && (
                <ManualVerificationTile
                    secretStorageKeyId={secretStorageKeyId}
                    secretStorageKeyContent={secretStorageKeyContent}
                    options={
                        <Chip
                            type="button"
                            variant="Secondary"
                            fill="Soft"
                            radii="Pill"
                            onClick={handleCancelVerification}
                        >
                            <Icon size="100" src={Icons.Cross} />
                        </Chip>
                    }
                />
            )}
        </>
    );
}

type VerifyOtherDeviceTileProps = {
    crypto: CryptoApi;
    deviceId: string;
};
export function VerifyOtherDeviceTile({ crypto, deviceId }: VerifyOtherDeviceTileProps) {
    const mx = useMatrixClient();
    const [requestState, setRequestState] = useState<AsyncState<VerificationRequest, Error>>({
        status: AsyncStatus.Idle,
    });

    const requestVerification = useAsync<VerificationRequest, Error, []>(
        useCallback(() => {
            const requestPromise = crypto.requestDeviceVerification(mx.getSafeUserId(), deviceId);
            return requestPromise;
        }, [mx, crypto, deviceId]),
        setRequestState
    );

    const handleExit = useCallback(() => {
        setRequestState({
            status: AsyncStatus.Idle,
        });
    }, []);

    const requesting = requestState.status === AsyncStatus.Loading;
    return (
        <InfoCard
            variant="Warning"
            title="Unverified"
            description="Verify device identity and grant access to encrypted messages."
            after={
                <Button
                    size="300"
                    variant="Warning"
                    radii="300"
                    onClick={requestVerification}
                    before={requesting && <Spinner size="100" variant="Warning" fill="Solid" />}
                    disabled={requesting}
                >
                    <Text as="span" size="B300">
                        Verify
                    </Text>
                </Button>
            }
        >
            {requestState.status === AsyncStatus.Error && (
                <Text size="T200">{requestState.error.message}</Text>
            )}
            {requestState.status === AsyncStatus.Success && (
                <DeviceVerification request={requestState.data} onExit={handleExit} />
            )}
        </InfoCard>
    );
}

type EnableVerificationProps = {
    visible: boolean;
};
/**
 * "Enable" opens the from-scratch `DeviceVerificationSetup`, which replaces
 * the account's secret storage and cross-signing and deletes every key backup
 * version it has. `visible` comes from account data (`useCrossSigningActive`),
 * which never says whether a backup exists, so the button renders only once
 * the homeserver itself answered that the account has neither a backup nor
 * cross-signing (S9, `docs/security/key-backup-nudge-2026-11-02.md`). This
 * page is not mounted in the shipped app today; the guard is here for when it
 * is.
 */
export function EnableVerification({ visible }: EnableVerificationProps) {
    const mx = useMatrixClient();
    const alive = useAlive();
    const [open, setOpen] = useState(false);
    const [accountState, setAccountState] = useState<AccountKeyVerdict | null>(null);

    useEffect(() => {
        if (!visible) return undefined;
        let current = true;
        const check = async () => {
            const crypto = mx.getCrypto();
            const [state, crossSigningReady] = await Promise.all([
                checkAccountKeyState(mx),
                crypto ? crypto.isCrossSigningReady() : Promise.resolve(false),
            ]);
            if (current && alive()) setAccountState(accountKeyVerdict(state, crossSigningReady));
        };
        void check();
        return () => {
            current = false;
        };
    }, [mx, visible, alive]);

    const handleCancel = useCallback(() => setOpen(false), []);

    const offered = visible && accountState === 'none';

    return (
        <>
            {offered && (
                <Button size="300" radii="300" onClick={() => setOpen(true)}>
                    <Text as="span" size="B300">
                        Enable
                    </Text>
                </Button>
            )}
            {offered && open && (
                <Overlay open backdrop={<OverlayBackdrop />}>
                    <OverlayCenter>
                        <FocusTrap
                            focusTrapOptions={{
                                initialFocus: false,
                                clickOutsideDeactivates: false,
                                escapeDeactivates: false,
                            }}
                        >
                            <DeviceVerificationSetup onCancel={handleCancel} />
                        </FocusTrap>
                    </OverlayCenter>
                </Overlay>
            )}
        </>
    );
}

export function DeviceVerificationOptions() {
    const [menuCords, setMenuCords] = useState<RectCords>();
    const authMetadata = useAuthMetadata();
    const accountManagementActions = useAccountManagementActions();

    const [reset, setReset] = useState(false);

    const handleCancelReset = useCallback(() => {
        setReset(false);
    }, []);

    const handleMenu: MouseEventHandler<HTMLButtonElement> = (event) => {
        setMenuCords(event.currentTarget.getBoundingClientRect());
    };

    const handleReset = () => {
        setMenuCords(undefined);

        if (authMetadata) {
            const authUrl = authMetadata.account_management_uri ?? authMetadata.issuer;
            window.open(
                withSearchParam(authUrl, {
                    action: accountManagementActions.crossSigningReset,
                }),
                '_blank'
            );
            return;
        }

        setReset(true);
    };

    return (
        <>
            <IconButton
                aria-pressed={!!menuCords}
                variant="SurfaceVariant"
                size="300"
                radii="300"
                onClick={handleMenu}
            >
                <Icon size="100" src={Icons.VerticalDots} />
            </IconButton>
            <PopOut
                anchor={menuCords}
                offset={5}
                position="Bottom"
                align="Center"
                content={
                    <FocusTrap
                        focusTrapOptions={{
                            initialFocus: false,
                            onDeactivate: () => setMenuCords(undefined),
                            clickOutsideDeactivates: true,
                            isKeyForward: (evt: KeyboardEvent) =>
                                evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
                            isKeyBackward: (evt: KeyboardEvent) =>
                                evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
                            escapeDeactivates: stopPropagation,
                        }}
                    >
                        <Menu>
                            <Box
                                direction="Column"
                                gap="100"
                                style={{ padding: config.space.S100 }}
                            >
                                <MenuItem
                                    variant="Critical"
                                    onClick={handleReset}
                                    size="300"
                                    radii="300"
                                    fill="None"
                                >
                                    <Text as="span" size="T300" truncate>
                                        Reset
                                    </Text>
                                </MenuItem>
                            </Box>
                        </Menu>
                    </FocusTrap>
                }
            />
            {reset && (
                <Overlay open backdrop={<OverlayBackdrop />}>
                    <OverlayCenter>
                        <FocusTrap
                            focusTrapOptions={{
                                initialFocus: false,
                                clickOutsideDeactivates: false,
                                escapeDeactivates: false,
                            }}
                        >
                            <DeviceVerificationReset onCancel={handleCancelReset} />
                        </FocusTrap>
                    </OverlayCenter>
                </Overlay>
            )}
        </>
    );
}
