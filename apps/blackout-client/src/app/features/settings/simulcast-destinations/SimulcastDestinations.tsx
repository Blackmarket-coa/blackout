import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Input, Spinner, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAlive } from '../../../hooks/useAlive';
import {
    createDestination,
    deleteDestination,
    isValidProvider,
    isValidRtmpUrl,
    listDestinations,
    PRESETS,
    setDestinationEnabled,
    type SimulcastDestinationSummary,
} from './simulcastDestinationsClient';

/**
 * Settings panel for RTMP simulcast destinations. The creator pastes a
 * stream key once at create time; the server encrypts it at rest and
 * never returns it. Subsequent operations (enable/disable, delete)
 * don't need the key. Lost keys are unrecoverable — delete + recreate
 * is the rotate path.
 */

interface SimulcastDestinationsProps {
    apiClient?: Parameters<typeof listDestinations>[0];
}

export function SimulcastDestinations({
    apiClient: testApiClient,
}: SimulcastDestinationsProps = {}) {
    const alive = useAlive();
    const [destinations, setDestinations] = useState<SimulcastDestinationSummary[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [provider, setProvider] = useState('twitch');
    const [label, setLabel] = useState('');
    const [ingestUrl, setIngestUrl] = useState(PRESETS[0].ingestUrl);
    const [streamKey, setStreamKey] = useState('');
    const [notice, setNotice] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const res = await listDestinations(testApiClient);
            if (!alive()) return;
            setDestinations(res.destinations);
            setLoaded(true);
        } catch (err) {
            if (!alive()) return;
            setLoadError((err as Error).message);
            setLoaded(true);
        }
    }, [alive, testApiClient]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const providerInvalid = provider.length > 0 && !isValidProvider(provider);
    const ingestInvalid = ingestUrl.length > 0 && !isValidRtmpUrl(ingestUrl);
    const canSubmit = useMemo(
        () =>
            isValidProvider(provider) &&
            isValidRtmpUrl(ingestUrl) &&
            streamKey.trim().length > 0,
        [provider, ingestUrl, streamKey],
    );

    const applyPreset = (presetProvider: string) => {
        const preset = PRESETS.find((p) => p.provider === presetProvider);
        if (!preset) return;
        setProvider(preset.provider);
        setIngestUrl(preset.ingestUrl);
        setLabel((cur) => (cur ? cur : preset.label));
    };

    const [createState, submitCreate] = useAsyncCallback(
        useCallback(async () => {
            setNotice(null);
            const res = await createDestination(
                {
                    provider: provider.trim().toLowerCase(),
                    label: label.trim() || undefined,
                    ingestUrl: ingestUrl.trim(),
                    streamKey: streamKey.trim(),
                },
                testApiClient,
            );
            await refresh();
            if (alive()) {
                // Wipe the key from component state immediately — never
                // persist it client-side.
                setStreamKey('');
                setLabel('');
                setNotice(`Added ${res.destination.provider} destination.`);
            }
            return res;
        }, [alive, ingestUrl, label, provider, refresh, streamKey, testApiClient]),
    );

    const [toggleState, submitToggle] = useAsyncCallback(
        useCallback(
            async (dest: SimulcastDestinationSummary) => {
                setNotice(null);
                await setDestinationEnabled(dest.id, !dest.isEnabled, testApiClient);
                await refresh();
                if (alive()) {
                    setNotice(
                        dest.isEnabled
                            ? `Disabled ${dest.provider}.`
                            : `Enabled ${dest.provider}.`,
                    );
                }
            },
            [alive, refresh, testApiClient],
        ),
    );

    const [deleteState, submitDelete] = useAsyncCallback(
        useCallback(
            async (dest: SimulcastDestinationSummary) => {
                setNotice(null);
                await deleteDestination(dest.id, testApiClient);
                await refresh();
                if (alive()) setNotice(`Removed ${dest.provider} destination.`);
            },
            [alive, refresh, testApiClient],
        ),
    );

    const busy =
        createState.status === AsyncStatus.Loading ||
        toggleState.status === AsyncStatus.Loading ||
        deleteState.status === AsyncStatus.Loading;

    return (
        <Box direction="Column" gap="200">
            <Text size="L400">Simulcast destinations</Text>
            <Text size="T200" priority="300">
                Stream once to Blackout, fan out to Twitch / YouTube / Kick simultaneously. Add an
                RTMP target and your provider's stream key here. Keys are encrypted at rest with
                AES-256-GCM and never returned by the API after creation. Rotate by deleting and
                recreating.
            </Text>

            {loadError && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    Could not load destinations: {loadError}
                </Text>
            )}
            {!loaded && (
                <Box gap="200" alignItems="Center">
                    <Spinner size="200" />
                    <Text size="T200">Loading…</Text>
                </Box>
            )}

            {loaded && (
                <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="200"
                >
                    <SettingTile
                        title={<Text as="span" size="T300">Add a destination</Text>}
                        description="Pick a preset or enter a custom RTMP target. Your stream key is sent to the server once and immediately encrypted."
                    />
                    <Box direction="Column" gap="100">
                        <Box gap="200" wrap="Wrap">
                            {PRESETS.map((preset) => (
                                <Button
                                    key={preset.provider}
                                    size="300"
                                    variant="Secondary"
                                    fill={provider === preset.provider ? 'Solid' : 'None'}
                                    radii="Pill"
                                    disabled={busy}
                                    onClick={() => applyPreset(preset.provider)}
                                    data-testid={`simulcast-preset-${preset.provider}`}
                                >
                                    <Text size="B300">{preset.label}</Text>
                                </Button>
                            ))}
                        </Box>
                        <Text size="T200">Provider</Text>
                        <Input
                            value={provider}
                            placeholder="twitch"
                            variant={providerInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setProvider(evt.currentTarget.value)}
                            data-testid="simulcast-provider-input"
                        />
                        <Text size="T200">Label (optional)</Text>
                        <Input
                            value={label}
                            placeholder="Main Twitch"
                            variant="Surface"
                            radii="300"
                            onChange={(evt) => setLabel(evt.currentTarget.value)}
                            data-testid="simulcast-label-input"
                        />
                        <Text size="T200">RTMP / RTMPS ingest URL</Text>
                        <Input
                            value={ingestUrl}
                            placeholder="rtmp://live.twitch.tv/app"
                            variant={ingestInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setIngestUrl(evt.currentTarget.value)}
                            data-testid="simulcast-ingest-input"
                        />
                        <Text size="T200">Stream key</Text>
                        <Input
                            value={streamKey}
                            placeholder="live_xxxxxxxxxxxxxxxxxxxx"
                            type="password"
                            variant="Surface"
                            radii="300"
                            onChange={(evt) => setStreamKey(evt.currentTarget.value)}
                            data-testid="simulcast-stream-key-input"
                        />
                        <Box gap="200">
                            <Button
                                size="300"
                                variant="Primary"
                                fill="Solid"
                                radii="Pill"
                                disabled={!canSubmit || busy}
                                onClick={() => void submitCreate()}
                                data-testid="simulcast-create-button"
                            >
                                <Text size="B300">Add destination</Text>
                            </Button>
                        </Box>
                    </Box>
                </SequenceCard>
            )}

            {loaded && destinations.length > 0 && (
                <Box direction="Column" gap="100">
                    <Text size="L400">Your destinations</Text>
                    {destinations.map((dest) => (
                        <SequenceCard
                            key={dest.id}
                            className={SequenceCardStyle}
                            variant="SurfaceVariant"
                            direction="Column"
                            gap="200"
                        >
                            <SettingTile
                                title={
                                    <Box gap="200" alignItems="Center">
                                        <Text as="span" size="T300">
                                            {dest.provider}
                                        </Text>
                                        {dest.label && (
                                            <Text as="span" size="T200" priority="300">
                                                ({dest.label})
                                            </Text>
                                        )}
                                        {!dest.isEnabled && (
                                            <Text as="span" size="T200" priority="300">
                                                disabled
                                            </Text>
                                        )}
                                    </Box>
                                }
                                description={
                                    <>
                                        <code>{dest.ingestUrl}</code>
                                        {dest.lastError && (
                                            <>
                                                {' · last error: '}
                                                <span
                                                    style={{
                                                        color: 'var(--mx-color-critical, #c00)',
                                                    }}
                                                >
                                                    {dest.lastError}
                                                </span>
                                            </>
                                        )}
                                    </>
                                }
                                after={
                                    <Box gap="200" alignItems="Center">
                                        <Button
                                            size="300"
                                            variant="Primary"
                                            fill="None"
                                            radii="Pill"
                                            disabled={busy}
                                            onClick={() => void submitToggle(dest)}
                                            data-testid={`simulcast-toggle-${dest.id}`}
                                        >
                                            <Text size="B300">
                                                {dest.isEnabled ? 'Disable' : 'Enable'}
                                            </Text>
                                        </Button>
                                        <Button
                                            size="300"
                                            variant="Critical"
                                            fill="None"
                                            radii="Pill"
                                            disabled={busy}
                                            onClick={() => void submitDelete(dest)}
                                            data-testid={`simulcast-delete-${dest.id}`}
                                        >
                                            <Text size="B300">Remove</Text>
                                        </Button>
                                    </Box>
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
            {toggleState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(toggleState.error as Error).message}
                </Text>
            )}
            {deleteState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(deleteState.error as Error).message}
                </Text>
            )}
        </Box>
    );
}

export default SimulcastDestinations;
