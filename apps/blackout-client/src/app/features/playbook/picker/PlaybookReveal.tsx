import React, { FormEventHandler, useCallback, useMemo, useState } from 'react';
import type { MatrixError, Room } from 'matrix-js-sdk';
import {
    Box,
    Button,
    Chip,
    Header,
    Icon,
    Icons,
    Input,
    Spinner,
    Text,
    TextArea,
    color,
    config,
} from 'folds';
import {
    PLAYBOOK_CATALOG,
    type PlaybookId,
} from '@blackout/protocol';
import { createPlaybookPayload } from '../../../../lib/bmc-core';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useAlive } from '../../../hooks/useAlive';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useCapabilities } from '../../../hooks/useCapabilities';
import { restrictedSupported } from '../../../utils/matrix';
import { CreateRoomKind, createRoom } from '../../../components/create-room';
import { BLACKOUT_TERMS } from '../../../lib/blackoutTerminology';
import { useSetAnyPlaybook } from '../usePlaybook';
import { useUpsertAnyDocument } from '../../documents/useDenDocuments';
import { seedDocumentsForPlaybook } from '../../documents/templates';
import { RevealActions, RevealHeader } from './PlaybookPicker.css';

/**
 * Reveal screen: names the archetype, lets the group nudge name + domain,
 * and Plants the den. Architecture per the plan's "Plant flow" — call
 * `createRoom` then write the `co.bmc.den.playbook` state event.
 *
 * Reaching this screen with `mode: 'trial'` is intentional. Every new den
 * starts in a 14-day try-before-commit window (work-stream J1), so the CTA
 * copy emphasizes try-not-commit and the description sets the expectation
 * that "every setting feels like a try, not a commitment."
 */
export interface PlaybookRevealProps {
    playbookId: PlaybookId;
    space?: Room;
    onCreate: (roomId: string) => void;
    onBack: () => void;
    onCustom: () => void;
}

function deriveCreateKind(space: Room | undefined, version: string): CreateRoomKind {
    if (space && restrictedSupported(version)) return CreateRoomKind.Restricted;
    return CreateRoomKind.Private;
}

export function PlaybookReveal({
    playbookId,
    space,
    onCreate,
    onBack,
    onCustom,
}: PlaybookRevealProps) {
    const entry = PLAYBOOK_CATALOG[playbookId];

    const mx = useMatrixClient();
    const alive = useAlive();
    const capabilities = useCapabilities();
    const roomVersions = capabilities['m.room_versions'];
    const defaultVersion = roomVersions?.default ?? '1';

    const [editedName, setEditedName] = useState<string>(entry.name);
    const [editedDomain, setEditedDomain] = useState<string>('');

    const setPlaybook = useSetAnyPlaybook();
    const upsertDocument = useUpsertAnyDocument();

    const plantBody = useCallback(async () => {
        const cleanedName = editedName.trim() || entry.name;
        const cleanedDomain = editedDomain.trim();

        const kind = deriveCreateKind(space, defaultVersion);
        const encryption = entry.features.governanceActive;

        const roomId = await createRoom(mx, {
            version: defaultVersion,
            parent: space,
            kind,
            name: cleanedName,
            topic: cleanedDomain || undefined,
            encryption,
            knock: false,
            allowFederation: true,
        });

        const payload = createPlaybookPayload(playbookId, new Date(), {
            name: cleanedName,
            domain: cleanedDomain,
        });
        await setPlaybook(roomId, payload);

        // Seed founding documents the playbook recommends. Errors here are
        // non-fatal — the den is still usable without seeds, and the user
        // can author docs from scratch in the Documents tab.
        if (entry.features.documents) {
            const seeds = seedDocumentsForPlaybook(playbookId);
            const me = mx.getUserId() ?? '';
            const seededAt = new Date().toISOString();
            await Promise.allSettled(
                seeds.map((template) =>
                    upsertDocument(roomId, {
                        docId: template.id,
                        title: template.title,
                        body: template.body,
                        version: 1,
                        derivedFromTemplateId: template.id,
                        lastEditorId: me,
                        editedAt: seededAt,
                    }),
                ),
            );
        }

        return roomId;
    }, [
        editedName,
        editedDomain,
        entry.name,
        entry.features.governanceActive,
        entry.features.documents,
        space,
        defaultVersion,
        mx,
        playbookId,
        setPlaybook,
        upsertDocument,
    ]);

    const [plantState, plant] = useAsyncCallback<string, Error | MatrixError, []>(plantBody);
    const loading = plantState.status === AsyncStatus.Loading;
    const error = plantState.status === AsyncStatus.Error ? plantState.error : undefined;
    const disabled = loading;

    const onSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
        evt.preventDefault();
        if (disabled) return;
        plant().then((roomId) => {
            if (alive() && roomId) {
                onCreate(roomId);
            }
        });
    };

    const onNameChange = (evt: React.ChangeEvent<HTMLInputElement>) =>
        setEditedName(evt.currentTarget.value);
    const onDomainChange = (evt: React.ChangeEvent<HTMLTextAreaElement>) =>
        setEditedDomain(evt.currentTarget.value);

    const grantSentence = useMemo(() => {
        const grant = entry.onboardingCreditGrant;
        if (!grant) return null;
        return `Your new ${BLACKOUT_TERMS.den.singular} starts with ${grant.amount} ${grant.currency} in its kitty.`;
    }, [entry.onboardingCreditGrant]);

    return (
        <Box as="form" onSubmit={onSubmit} direction="Column" gap="500">
            <Header size="400" style={{ padding: 0 }}>
                <Box direction="Column" gap="100" grow="Yes">
                    <Text size="L400" priority="300">
                        {BLACKOUT_TERMS.plant.revealLead}
                    </Text>
                    <Text size="H4">{entry.name}</Text>
                </Box>
            </Header>

            <Box
                direction="Column"
                gap="200"
                className={RevealHeader}
                style={{ background: color.SurfaceVariant.Container }}
            >
                <Text size="T300" priority="400">
                    {entry.description}
                </Text>
                {grantSentence && (
                    <Text size="T200" priority="300">
                        {grantSentence}
                    </Text>
                )}
                <Text size="T200" priority="300">
                    Every {BLACKOUT_TERMS.den.singular} starts as a 14-day try — you can commit, switch
                    {' '}playbook, or revert anytime in that window.
                </Text>
            </Box>

            <Box direction="Column" gap="100">
                <Text size="L400">Name</Text>
                <Input
                    name="nameInput"
                    value={editedName}
                    onChange={onNameChange}
                    size="500"
                    variant="SurfaceVariant"
                    radii="400"
                    autoComplete="off"
                    disabled={disabled}
                />
            </Box>

            <Box direction="Column" gap="100">
                <Text size="L400">Domain (optional)</Text>
                <Text size="T200" priority="300">
                    One sentence: what does this circle have authority over?
                </Text>
                <TextArea
                    name="domainTextArea"
                    value={editedDomain}
                    onChange={onDomainChange}
                    size="500"
                    variant="SurfaceVariant"
                    radii="400"
                    disabled={disabled}
                />
            </Box>

            {error && (
                <Box style={{ color: color.Critical.Main }} alignItems="Center" gap="200">
                    <Icon src={Icons.Warning} filled size="100" />
                    <Text size="T300" style={{ color: color.Critical.Main }}>
                        <b>{error.message}</b>
                    </Text>
                </Box>
            )}

            <Box direction="Column" gap="200" className={RevealActions}>
                <Button
                    type="submit"
                    size="500"
                    variant="Primary"
                    radii="400"
                    disabled={disabled}
                    before={loading && <Spinner variant="Primary" fill="Solid" size="200" />}
                >
                    <Text size="B500">{BLACKOUT_TERMS.plant.cta}</Text>
                </Button>
                <Box gap="200" justifyContent="SpaceBetween">
                    <Chip
                        as="button"
                        type="button"
                        radii="Pill"
                        variant="SurfaceVariant"
                        onClick={onBack}
                        disabled={disabled}
                        before={<Icon size="50" src={Icons.ArrowLeft} />}
                    >
                        <Text size="T200">Back</Text>
                    </Chip>
                    <Chip
                        as="button"
                        type="button"
                        radii="Pill"
                        variant="SurfaceVariant"
                        onClick={onCustom}
                        disabled={disabled}
                    >
                        <Text size="T200" priority="300">
                            {BLACKOUT_TERMS.plant.custom}
                        </Text>
                    </Chip>
                </Box>
            </Box>
            <Box style={{ marginTop: config.space.S0 }} />
        </Box>
    );
}
