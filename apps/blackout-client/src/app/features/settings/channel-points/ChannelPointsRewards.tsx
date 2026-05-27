import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Input, Spinner, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAlive } from '../../../hooks/useAlive';
import {
    createReward,
    decodeBlackoutUserId,
    deleteReward,
    grantPoints,
    isValidCost,
    isValidRewardTitle,
    listRedemptions,
    listRewards,
    updateReward,
    type ChannelPointsReward,
    type Redemption,
} from '../../streams/channelPointsClient';

/**
 * Creator surface for the native channel-points economy. Define redeemable
 * rewards, grant points to a viewer, and review recent redemptions. Backed by
 * /v1/channel-points; the creator's channel id is their own Blackout user id
 * (decoded from the session token).
 */

interface ChannelPointsRewardsProps {
    apiClient?: Parameters<typeof listRewards>[1];
    /** Test seam: override the resolved channel id. */
    channelId?: string;
}

export function ChannelPointsRewards({
    apiClient: testApiClient,
    channelId: channelIdProp,
}: ChannelPointsRewardsProps = {}) {
    const alive = useAlive();
    const channelId = useMemo(() => channelIdProp ?? decodeBlackoutUserId(), [channelIdProp]);

    const [rewards, setRewards] = useState<ChannelPointsReward[]>([]);
    const [redemptions, setRedemptions] = useState<Redemption[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [title, setTitle] = useState('');
    const [cost, setCost] = useState('100');
    const [prompt, setPrompt] = useState('');
    const [grantUser, setGrantUser] = useState('');
    const [grantAmount, setGrantAmount] = useState('100');
    const [notice, setNotice] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!channelId) {
            setLoaded(true);
            return;
        }
        setLoadError(null);
        try {
            const [rewardsRes, redemptionsRes] = await Promise.all([
                listRewards(channelId, testApiClient),
                listRedemptions(channelId, testApiClient).catch(() => ({ items: [] as Redemption[] })),
            ]);
            if (!alive()) return;
            setRewards(rewardsRes.rewards);
            setRedemptions(redemptionsRes.items);
            setLoaded(true);
        } catch (err) {
            if (!alive()) return;
            setLoadError((err as Error).message);
            setLoaded(true);
        }
    }, [alive, channelId, testApiClient]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const costNum = Number.parseInt(cost, 10);
    const titleInvalid = title.length > 0 && !isValidRewardTitle(title);
    const costInvalid = cost.length > 0 && !isValidCost(costNum);
    const canCreate = useMemo(
        () => isValidRewardTitle(title) && isValidCost(costNum),
        [title, costNum],
    );

    const [createState, submitCreate] = useAsyncCallback<ChannelPointsReward, Error, []>(
        useCallback(async () => {
            setNotice(null);
            const reward = await createReward(
                { title: title.trim(), cost: costNum, prompt: prompt.trim() || undefined },
                testApiClient,
            );
            await refresh();
            if (alive()) {
                setTitle('');
                setCost('100');
                setPrompt('');
                setNotice(`Created reward "${reward.title}".`);
            }
            return reward;
        }, [alive, title, costNum, prompt, refresh, testApiClient]),
    );

    const [mutateState, submitMutate] = useAsyncCallback(
        useCallback(
            async (action: () => Promise<unknown>) => {
                setNotice(null);
                await action();
                await refresh();
            },
            [refresh],
        ),
    );

    const grantNum = Number.parseInt(grantAmount, 10);
    const canGrant = Boolean(channelId) && grantUser.trim().length > 0 && isValidCost(grantNum);
    const [grantState, submitGrant] = useAsyncCallback(
        useCallback(async () => {
            if (!channelId) return;
            setNotice(null);
            const res = await grantPoints(
                channelId,
                { userId: grantUser.trim(), points: grantNum },
                testApiClient,
            );
            if (alive()) {
                setGrantUser('');
                setGrantAmount('100');
                setNotice(`Granted points. ${grantUser.trim()} now holds ${res.balance}.`);
            }
        }, [alive, channelId, grantUser, grantNum, testApiClient]),
    );

    const busy =
        createState.status === AsyncStatus.Loading ||
        mutateState.status === AsyncStatus.Loading ||
        grantState.status === AsyncStatus.Loading;

    return (
        <Box direction="Column" gap="200">
            <Text size="L400">Channel points</Text>
            <Text size="T200" priority="300">
                Define rewards viewers redeem with points earned on your channel, grant points, and
                review recent redemptions. Redemptions fire your `channelpoints.redeemed` webhooks.
            </Text>

            {!channelId && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    Sign in to manage channel points.
                </Text>
            )}
            {loadError && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    Could not load channel points: {loadError}
                </Text>
            )}
            {!loaded && (
                <Box gap="200" alignItems="Center">
                    <Spinner size="200" />
                    <Text size="T200">Loading…</Text>
                </Box>
            )}

            {loaded && channelId && (
                <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="200"
                >
                    <SettingTile
                        title={<Text as="span" size="T300">Create a reward</Text>}
                        description="Title, point cost, and an optional prompt the viewer fills in (e.g. a song link)."
                    />
                    <Box direction="Column" gap="100">
                        <Text size="T200">Title</Text>
                        <Input
                            value={title}
                            placeholder="Play my song"
                            variant={titleInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(e) => setTitle(e.currentTarget.value)}
                            data-testid="cp-title-input"
                        />
                        <Text size="T200">Cost (points)</Text>
                        <Input
                            type="number"
                            value={cost}
                            variant={costInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(e) => setCost(e.currentTarget.value)}
                            data-testid="cp-cost-input"
                        />
                        <Text size="T200">Prompt (optional)</Text>
                        <Input
                            value={prompt}
                            placeholder="Drop a link"
                            variant="Surface"
                            radii="300"
                            onChange={(e) => setPrompt(e.currentTarget.value)}
                            data-testid="cp-prompt-input"
                        />
                        <Box gap="200">
                            <Button
                                size="300"
                                variant="Primary"
                                fill="Solid"
                                radii="Pill"
                                disabled={!canCreate || busy}
                                onClick={() => void submitCreate()}
                                data-testid="cp-create-button"
                            >
                                <Text size="B300">Create reward</Text>
                            </Button>
                        </Box>
                    </Box>
                </SequenceCard>
            )}

            {loaded && channelId && rewards.length > 0 && (
                <Box direction="Column" gap="100">
                    <Text size="L400">Rewards</Text>
                    {rewards.map((reward) => (
                        <SequenceCard
                            key={reward.id}
                            className={SequenceCardStyle}
                            variant="SurfaceVariant"
                            direction="Column"
                            gap="200"
                        >
                            <SettingTile
                                title={<Text as="span" size="T300">{reward.title}</Text>}
                                description={`${reward.cost} pts${reward.prompt ? ` · "${reward.prompt}"` : ''}${reward.isActive ? '' : ' · inactive'}`}
                                after={
                                    <Box gap="200">
                                        <Button
                                            size="300"
                                            variant="Secondary"
                                            fill="Soft"
                                            radii="Pill"
                                            disabled={busy}
                                            onClick={() =>
                                                void submitMutate(() =>
                                                    updateReward(
                                                        reward.id,
                                                        { isActive: !reward.isActive },
                                                        testApiClient,
                                                    ),
                                                )
                                            }
                                            data-testid={`cp-toggle-${reward.id}`}
                                        >
                                            <Text size="B300">{reward.isActive ? 'Disable' : 'Enable'}</Text>
                                        </Button>
                                        <Button
                                            size="300"
                                            variant="Critical"
                                            fill="None"
                                            radii="Pill"
                                            disabled={busy}
                                            onClick={() =>
                                                void submitMutate(() =>
                                                    deleteReward(reward.id, testApiClient),
                                                )
                                            }
                                            data-testid={`cp-delete-${reward.id}`}
                                        >
                                            <Text size="B300">Delete</Text>
                                        </Button>
                                    </Box>
                                }
                            />
                        </SequenceCard>
                    ))}
                </Box>
            )}

            {loaded && channelId && (
                <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="200"
                >
                    <SettingTile
                        title={<Text as="span" size="T300">Grant points</Text>}
                        description="Credit a viewer's balance on your channel (by Blackout user id)."
                    />
                    <Box direction="Column" gap="100">
                        <Text size="T200">Viewer user id</Text>
                        <Input
                            value={grantUser}
                            radii="300"
                            variant="Surface"
                            onChange={(e) => setGrantUser(e.currentTarget.value)}
                            data-testid="cp-grant-user-input"
                        />
                        <Text size="T200">Points</Text>
                        <Input
                            type="number"
                            value={grantAmount}
                            radii="300"
                            variant="Surface"
                            onChange={(e) => setGrantAmount(e.currentTarget.value)}
                            data-testid="cp-grant-amount-input"
                        />
                        <Box gap="200">
                            <Button
                                size="300"
                                variant="Primary"
                                fill="Soft"
                                radii="Pill"
                                disabled={!canGrant || busy}
                                onClick={() => void submitGrant()}
                                data-testid="cp-grant-button"
                            >
                                <Text size="B300">Grant</Text>
                            </Button>
                        </Box>
                    </Box>
                </SequenceCard>
            )}

            {loaded && channelId && redemptions.length > 0 && (
                <Box direction="Column" gap="100">
                    <Text size="L400">Recent redemptions</Text>
                    {redemptions.map((r) => (
                        <SequenceCard
                            key={r.id}
                            className={SequenceCardStyle}
                            variant="SurfaceVariant"
                            direction="Column"
                            gap="200"
                        >
                            <SettingTile
                                title={<Text as="span" size="T300">{r.rewardTitle ?? '(reward)'}</Text>}
                                description={
                                    `${r.cost} pts · by ${r.userId}` +
                                    (r.userInput ? ` · "${r.userInput}"` : '') +
                                    ` · ${new Date(r.createdAt).toLocaleString()}`
                                }
                            />
                        </SequenceCard>
                    ))}
                </Box>
            )}

            {notice && (
                <Text size="T200" priority="300">
                    {notice}
                </Text>
            )}
            {createState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(createState.error as Error).message}
                </Text>
            )}
            {grantState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(grantState.error as Error).message}
                </Text>
            )}
            {mutateState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(mutateState.error as Error).message}
                </Text>
            )}
        </Box>
    );
}

export default ChannelPointsRewards;
