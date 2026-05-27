import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Input, Spinner, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAlive } from '../../../hooks/useAlive';
import {
    EXTENSION_CAPABILITIES,
    createExtension,
    deleteExtension,
    isValidBundleUrl,
    isValidExtensionLabel,
    listExtensions,
    updateExtension,
    type ExtensionCapability,
    type ExtensionPanel,
} from './twitchExtensionsClient';

/**
 * Creator surface for the Twitch extension registry. Register panel extensions
 * (label + https bundle URL + capability scopes); they surface on all of the
 * creator's streams and render in the livestream viewer's sandboxed panel stack.
 */

const CAPABILITY_LABELS: Record<ExtensionCapability, string> = {
    'twitch.ext.identityShare': 'Identity share',
    'twitch.ext.subscriptionStatus': 'Subscription status',
};

interface TwitchExtensionsProps {
    apiClient?: Parameters<typeof listExtensions>[0];
}

export function TwitchExtensions({ apiClient: testApiClient }: TwitchExtensionsProps = {}) {
    const alive = useAlive();
    const [panels, setPanels] = useState<ExtensionPanel[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [label, setLabel] = useState('');
    const [bundleUrl, setBundleUrl] = useState('');
    const [caps, setCaps] = useState<ExtensionCapability[]>([]);
    const [notice, setNotice] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const res = await listExtensions(testApiClient);
            if (!alive()) return;
            setPanels(res.items);
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

    const labelInvalid = label.length > 0 && !isValidExtensionLabel(label);
    const urlInvalid = bundleUrl.length > 0 && !isValidBundleUrl(bundleUrl);
    const canSubmit = useMemo(
        () => isValidExtensionLabel(label) && isValidBundleUrl(bundleUrl),
        [label, bundleUrl],
    );

    const toggleCap = (cap: ExtensionCapability) =>
        setCaps((prev) => (prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]));

    const [createState, submitCreate] = useAsyncCallback<ExtensionPanel, Error, []>(
        useCallback(async () => {
            setNotice(null);
            const panel = await createExtension(
                { label: label.trim(), bundleUrl: bundleUrl.trim(), capabilities: caps },
                testApiClient,
            );
            await refresh();
            if (alive()) {
                setLabel('');
                setBundleUrl('');
                setCaps([]);
                setNotice(`Registered "${panel.label}". It now appears on your streams.`);
            }
            return panel;
        }, [alive, label, bundleUrl, caps, refresh, testApiClient]),
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

    const busy =
        createState.status === AsyncStatus.Loading || mutateState.status === AsyncStatus.Loading;

    return (
        <Box direction="Column" gap="200">
            <Text size="L400">Twitch extensions</Text>
            <Text size="T200" priority="300">
                Register panel extensions by their JS bundle URL (https). They render below the
                player on every one of your streams. Capability scopes gate what the extension may
                request from a viewer.
            </Text>

            {loadError && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    Could not load extensions: {loadError}
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
                        title={<Text as="span" size="T300">Register an extension</Text>}
                        description="The bundle URL must be https. The host sandboxes the extension in a visible iframe and gates the selected capabilities."
                    />
                    <Box direction="Column" gap="100">
                        <Text size="T200">Label</Text>
                        <Input
                            value={label}
                            placeholder="Sound Alerts"
                            variant={labelInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setLabel(evt.currentTarget.value)}
                            data-testid="ext-label-input"
                        />
                        {labelInvalid && (
                            <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                                Label must be 1–120 characters.
                            </Text>
                        )}
                        <Text size="T200">Bundle URL (https)</Text>
                        <Input
                            value={bundleUrl}
                            placeholder="https://cdn.example.com/ext.js"
                            variant={urlInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setBundleUrl(evt.currentTarget.value)}
                            data-testid="ext-url-input"
                        />
                        {urlInvalid && (
                            <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                                Must be a valid https URL.
                            </Text>
                        )}
                        <Box gap="200" wrap="Wrap">
                            {EXTENSION_CAPABILITIES.map((cap) => (
                                <Button
                                    key={cap}
                                    size="300"
                                    variant={caps.includes(cap) ? 'Primary' : 'Secondary'}
                                    fill={caps.includes(cap) ? 'Solid' : 'Soft'}
                                    radii="Pill"
                                    onClick={() => toggleCap(cap)}
                                    data-testid={`ext-cap-${cap}`}
                                >
                                    <Text size="B300">{CAPABILITY_LABELS[cap]}</Text>
                                </Button>
                            ))}
                        </Box>
                        <Box gap="200">
                            <Button
                                size="300"
                                variant="Primary"
                                fill="Solid"
                                radii="Pill"
                                disabled={!canSubmit || busy}
                                onClick={() => void submitCreate()}
                                data-testid="ext-create-button"
                            >
                                <Text size="B300">Register</Text>
                            </Button>
                        </Box>
                    </Box>
                </SequenceCard>
            )}

            {loaded && panels.length > 0 && (
                <Box direction="Column" gap="100">
                    <Text size="L400">Registered extensions</Text>
                    {panels.map((panel) => (
                        <SequenceCard
                            key={panel.id}
                            className={SequenceCardStyle}
                            variant="SurfaceVariant"
                            direction="Column"
                            gap="200"
                        >
                            <SettingTile
                                title={
                                    <Box gap="200" alignItems="Center">
                                        <Text as="span" size="T300">{panel.label}</Text>
                                        {!panel.isActive && (
                                            <Text as="span" size="T200" priority="300">
                                                (hidden)
                                            </Text>
                                        )}
                                    </Box>
                                }
                                description={
                                    panel.bundleUrl +
                                    (panel.capabilities.length > 0
                                        ? ` · ${panel.capabilities.length} capability(ies)`
                                        : ' · no capabilities')
                                }
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
                                                    updateExtension(
                                                        panel.id,
                                                        { isActive: !panel.isActive },
                                                        testApiClient,
                                                    ),
                                                )
                                            }
                                            data-testid={`ext-toggle-${panel.id}`}
                                        >
                                            <Text size="B300">{panel.isActive ? 'Hide' : 'Show'}</Text>
                                        </Button>
                                        <Button
                                            size="300"
                                            variant="Critical"
                                            fill="None"
                                            radii="Pill"
                                            disabled={busy}
                                            onClick={() =>
                                                void submitMutate(() =>
                                                    deleteExtension(panel.id, testApiClient),
                                                )
                                            }
                                            data-testid={`ext-delete-${panel.id}`}
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
            {mutateState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(mutateState.error as Error).message}
                </Text>
            )}
        </Box>
    );
}

export default TwitchExtensions;
