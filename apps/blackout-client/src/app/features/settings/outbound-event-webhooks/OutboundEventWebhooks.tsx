import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Input, Spinner, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAlive } from '../../../hooks/useAlive';
import {
    ALL_OUTBOUND_EVENT_TYPES,
    deleteSubscription,
    isValidEventTypeSelection,
    isValidName,
    isValidTargetUrl,
    listSubscriptions,
    registerSubscription,
    testDeliver,
    type OutboundEventType,
    type OutboundEventWebhook,
    type RegisterResponse,
} from './outboundEventWebhooksClient';

/**
 * Settings panel for outbound Discord-shape event webhooks. The creator
 * pastes a URL — typically their own Discord channel webhook (Blackout
 * writes back to Discord with NO OAuth required), or Zapier / IFTTT /
 * n8n / their own backend — and picks which event types they want
 * delivered there. The HMAC signing secret is shown ONCE.
 */

interface OutboundEventWebhooksProps {
    apiClient?: Parameters<typeof listSubscriptions>[0];
}

export function OutboundEventWebhooks({
    apiClient: testApiClient,
}: OutboundEventWebhooksProps = {}) {
    const alive = useAlive();
    const [subs, setSubs] = useState<OutboundEventWebhook[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    const [name, setName] = useState('');
    const [targetUrl, setTargetUrl] = useState('');
    const [selectedTypes, setSelectedTypes] = useState<OutboundEventType[]>([]);
    const [notice, setNotice] = useState<string | null>(null);
    /** Plaintext signing secret surfaced ONCE after a successful create. */
    const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(
        null,
    );

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const res = await listSubscriptions(testApiClient);
            if (!alive()) return;
            setSubs(res.subscriptions);
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

    const nameInvalid = name.length > 0 && !isValidName(name);
    const urlInvalid = targetUrl.length > 0 && !isValidTargetUrl(targetUrl);
    const canSubmit = useMemo(
        () =>
            isValidName(name) &&
            isValidTargetUrl(targetUrl) &&
            isValidEventTypeSelection(selectedTypes),
        [name, targetUrl, selectedTypes],
    );

    const toggleType = (t: OutboundEventType) => {
        setSelectedTypes((prev) =>
            prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
        );
    };

    const [createState, submitCreate] = useAsyncCallback<RegisterResponse, Error, []>(
        useCallback(async () => {
            setNotice(null);
            setRevealedSecret(null);
            const res = await registerSubscription(
                {
                    name: name.trim(),
                    targetUrl: targetUrl.trim(),
                    eventTypes: selectedTypes,
                },
                testApiClient,
            );
            await refresh();
            if (alive()) {
                setName('');
                setTargetUrl('');
                setSelectedTypes([]);
                setRevealedSecret({ id: res.subscription.id, secret: res.signingSecret });
                setNotice(
                    `Registered "${res.subscription.name}". Copy the signing secret below now — it won't be shown again.`,
                );
            }
            return res;
        }, [alive, name, refresh, selectedTypes, targetUrl, testApiClient]),
    );

    const [deleteState, submitDelete] = useAsyncCallback(
        useCallback(
            async (sub: OutboundEventWebhook) => {
                setNotice(null);
                setRevealedSecret(null);
                await deleteSubscription(sub.id, testApiClient);
                await refresh();
                if (alive()) setNotice(`Removed subscription "${sub.name}".`);
            },
            [alive, refresh, testApiClient],
        ),
    );

    const [testState, submitTest] = useAsyncCallback(
        useCallback(
            async (sub: OutboundEventWebhook) => {
                setNotice(null);
                const res = await testDeliver(
                    sub.id,
                    {
                        eventType: 'tip.created',
                        data: { amount: 0, note: 'test_delivery' },
                    },
                    testApiClient,
                );
                if (alive()) {
                    setNotice(
                        res.report.ok
                            ? `Test delivered (HTTP ${res.report.status}).`
                            : `Test delivery failed: ${res.report.reason ?? `HTTP ${res.report.status ?? '?'}`}.`,
                    );
                    await refresh();
                }
            },
            [alive, refresh, testApiClient],
        ),
    );

    const busy =
        createState.status === AsyncStatus.Loading ||
        deleteState.status === AsyncStatus.Loading ||
        testState.status === AsyncStatus.Loading;

    return (
        <Box direction="Column" gap="200">
            <Text size="L400">Outbound event webhooks</Text>
            <Text size="T200" priority="300">
                Forward Blackout events to any URL that accepts a Discord-shape webhook —
                your own Discord channel, Zapier, IFTTT, n8n, or a custom backend. Each
                delivery is signed with HMAC-SHA256 in <code>X-Blackout-Signature</code> over{' '}
                <code>{`${'${timestamp}'}.${'${body}'}`}</code>.
            </Text>

            {loadError && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    Could not load subscriptions: {loadError}
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
                        title={<Text as="span" size="T300">Add a subscription</Text>}
                        description="The signing secret is shown only once after creation. No event types selected = subscribe to all."
                    />
                    <Box direction="Column" gap="100">
                        <Text size="T200">Label</Text>
                        <Input
                            value={name}
                            placeholder="My Discord channel"
                            variant={nameInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setName(evt.currentTarget.value)}
                            data-testid="outbound-webhook-name-input"
                        />
                        {nameInvalid && (
                            <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                                Label is required and must be ≤ 80 characters.
                            </Text>
                        )}

                        <Text size="T200">Target URL</Text>
                        <Input
                            value={targetUrl}
                            placeholder="https://discord.com/api/webhooks/123/abc..."
                            variant={urlInvalid ? 'Critical' : 'Surface'}
                            radii="300"
                            onChange={(evt) => setTargetUrl(evt.currentTarget.value)}
                            data-testid="outbound-webhook-url-input"
                        />
                        {urlInvalid && (
                            <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                                Must be an http(s) URL pointing at a public host.
                            </Text>
                        )}

                        <Text size="T200">Event types</Text>
                        <Box wrap="Wrap" gap="100">
                            {ALL_OUTBOUND_EVENT_TYPES.map((t) => {
                                const on = selectedTypes.includes(t);
                                return (
                                    <Button
                                        key={t}
                                        size="300"
                                        variant={on ? 'Primary' : 'Secondary'}
                                        fill={on ? 'Solid' : 'Soft'}
                                        radii="Pill"
                                        onClick={() => toggleType(t)}
                                        data-testid={`outbound-webhook-type-${t}`}
                                    >
                                        <Text size="B300">{t}</Text>
                                    </Button>
                                );
                            })}
                        </Box>

                        <Box gap="200">
                            <Button
                                size="300"
                                variant="Primary"
                                fill="Solid"
                                radii="Pill"
                                disabled={!canSubmit || busy}
                                onClick={() => void submitCreate()}
                                data-testid="outbound-webhook-create-button"
                            >
                                <Text size="B300">Register</Text>
                            </Button>
                        </Box>
                    </Box>
                </SequenceCard>
            )}

            {revealedSecret && (
                <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="200"
                >
                    <SettingTile
                        title={<Text as="span" size="T300">Signing secret — copy now</Text>}
                        description="Configure your receiver to verify HMAC-SHA256 of `${timestamp}.${body}` against this secret. After leaving this page the secret is unrecoverable."
                    />
                    <Input
                        value={revealedSecret.secret}
                        readOnly
                        variant="Surface"
                        radii="300"
                        data-testid="outbound-webhook-revealed-secret"
                    />
                </SequenceCard>
            )}

            {loaded && subs.length > 0 && (
                <Box direction="Column" gap="100">
                    <Text size="L400">Active subscriptions</Text>
                    {subs.map((sub) => (
                        <SequenceCard
                            key={sub.id}
                            className={SequenceCardStyle}
                            variant="SurfaceVariant"
                            direction="Column"
                            gap="200"
                        >
                            <SettingTile
                                title={
                                    <Box gap="200" alignItems="Center">
                                        <Text as="span" size="T300">
                                            {sub.name}
                                        </Text>
                                        <Text as="span" size="T200" priority="300">
                                            → {sub.targetUrl}
                                        </Text>
                                        {!sub.isActive && (
                                            <Text as="span" size="T200" priority="300">
                                                (paused)
                                            </Text>
                                        )}
                                    </Box>
                                }
                                description={
                                    `${sub.eventTypes.length === 0 ? 'all events' : sub.eventTypes.join(', ')} · ` +
                                    `${sub.deliveryCount} deliveries` +
                                    (sub.lastDeliveryAt
                                        ? ` · last ${new Date(sub.lastDeliveryAt).toLocaleString()}`
                                        : '') +
                                    (sub.consecutiveFailures > 0
                                        ? ` · ${sub.consecutiveFailures} consecutive failures`
                                        : '')
                                }
                                after={
                                    <Box gap="200">
                                        <Button
                                            size="300"
                                            variant="Secondary"
                                            fill="Soft"
                                            radii="Pill"
                                            disabled={busy || !sub.isActive}
                                            onClick={() => void submitTest(sub)}
                                            data-testid={`outbound-webhook-test-${sub.id}`}
                                        >
                                            <Text size="B300">Send test</Text>
                                        </Button>
                                        <Button
                                            size="300"
                                            variant="Critical"
                                            fill="None"
                                            radii="Pill"
                                            disabled={busy}
                                            onClick={() => void submitDelete(sub)}
                                            data-testid={`outbound-webhook-delete-${sub.id}`}
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
            {deleteState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(deleteState.error as Error).message}
                </Text>
            )}
            {testState.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--mx-color-critical, #c00)' }}>
                    {(testState.error as Error).message}
                </Text>
            )}
        </Box>
    );
}

export default OutboundEventWebhooks;
