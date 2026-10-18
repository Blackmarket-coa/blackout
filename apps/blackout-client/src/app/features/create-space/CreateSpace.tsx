import React, { FormEventHandler, useCallback, useEffect, useState } from 'react';
import { MatrixError, Room } from 'matrix-js-sdk';
import {
    Box,
    Button,
    Chip,
    color,
    config,
    Icon,
    Icons,
    Input,
    Spinner,
    Switch,
    Text,
    TextArea,
} from 'folds';
import { SettingTile } from '../../components/setting-tile';
import { SequenceCard } from '../../components/sequence-card';
import {
    creatorsSupported,
    knockRestrictedSupported,
    knockSupported,
    restrictedSupported,
} from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { millisecondsToMinutes, replaceSpaceWithDash } from '../../utils/common';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useCapabilities } from '../../hooks/useCapabilities';
import { useAlive } from '../../hooks/useAlive';
import { ErrorCode } from '../../cs-errorcode';
import { formatMatrixError } from '../../utils/matrixError';
import {
    AdditionalCreatorInput,
    createRoom,
    CreateRoomAliasInput,
    CreateRoomData,
    CreateRoomKind,
    CreateRoomKindSelector,
    newCanopyDefaults,
    parentKindOf,
    RoomVersionSelector,
    useAdditionalCreators,
} from '../../components/create-room';
import { RoomType } from '../../../types/matrix/room';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { indexCanopy } from '../discovery/discoveryClient';

const getCreateSpaceKindToIcon = (kind: CreateRoomKind) => {
    if (kind === CreateRoomKind.Private) return Icons.SpaceLock;
    if (kind === CreateRoomKind.Restricted) return Icons.Space;
    return Icons.SpaceGlobe;
};

type CreateSpaceFormProps = {
    defaultKind?: CreateRoomKind;
    space?: Room;
    onCreate?: (roomId: string) => void;
};
export function CreateSpaceForm({ defaultKind, space, onCreate }: CreateSpaceFormProps) {
    const mx = useMatrixClient();
    const alive = useAlive();

    const capabilities = useCapabilities();
    const roomVersions = capabilities['m.room_versions'];
    const [selectedRoomVersion, selectRoomVersion] = useState(roomVersions?.default ?? '1');
    useEffect(() => {
        // capabilities load async
        selectRoomVersion(roomVersions?.default ?? '1');
    }, [roomVersions?.default]);

    const allowRestricted = space && restrictedSupported(selectedRoomVersion);

    // The default access comes from the one table in `newRoomDefaults.ts`
    // (public in the Blackout app, private in the Black Mask panel, restricted
    // inside a canopy that is not public), unless the caller passes one. The
    // `??` is parenthesised on purpose: `a ?? b ? c : d` parses as
    // `(a ?? b) ? c : d`, which made any passed `defaultKind` yield Restricted.
    const defaults = newCanopyDefaults({
        parentKind: parentKindOf(space),
        restrictedSupported: Boolean(allowRestricted),
    });
    const [kind, setKind] = useState(defaultKind ?? defaults.kind);
    // "List in the Blackout directory", offered when the canopy is not Public;
    // off by default. A Public canopy is always listed.
    const [listInDirectory, setListInDirectory] = useState(false);

    const allowAdditionalCreators = creatorsSupported(selectedRoomVersion);
    const { additionalCreators, addAdditionalCreator, removeAdditionalCreator } =
        useAdditionalCreators();
    const [federation, setFederation] = useState(true);
    const [knock, setKnock] = useState(false);
    const [advance, setAdvance] = useState(false);

    const allowKnock = kind === CreateRoomKind.Private && knockSupported(selectedRoomVersion);
    const allowKnockRestricted =
        kind === CreateRoomKind.Restricted && knockRestrictedSupported(selectedRoomVersion);

    const handleRoomVersionChange = (version: string) => {
        if (!restrictedSupported(version)) {
            setKind(CreateRoomKind.Private);
        }
        selectRoomVersion(version);
    };

    const [createState, create] = useAsyncCallback<string, Error | MatrixError, [CreateRoomData]>(
        useCallback((data) => createRoom(mx, data), [mx])
    );
    const loading = createState.status === AsyncStatus.Loading;
    const error = createState.status === AsyncStatus.Error ? createState.error : undefined;
    const disabled = createState.status === AsyncStatus.Loading;

    const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
        evt.preventDefault();
        if (disabled) return;
        const form = evt.currentTarget;

        const nameInput = form.nameInput as HTMLInputElement | undefined;
        const topicTextArea = form.topicTextAria as HTMLTextAreaElement | undefined;
        const aliasInput = form.aliasInput as HTMLInputElement | undefined;
        const roomName = nameInput?.value.trim();
        const roomTopic = topicTextArea?.value.trim();
        const aliasLocalPart =
            aliasInput && aliasInput.value ? replaceSpaceWithDash(aliasInput.value) : undefined;

        if (!roomName) return;
        const publicRoom = kind === CreateRoomKind.Public;
        const listCanopy = publicRoom || listInDirectory;
        let roomKnock = false;
        if (allowKnock && kind === CreateRoomKind.Private) {
            roomKnock = knock;
        }
        if (allowKnockRestricted && kind === CreateRoomKind.Restricted) {
            roomKnock = knock;
        }

        create({
            version: selectedRoomVersion,
            type: RoomType.Space,
            parent: space,
            kind,
            name: roomName,
            topic: roomTopic || undefined,
            aliasLocalPart: publicRoom ? aliasLocalPart : undefined,
            knock: roomKnock,
            allowFederation: federation,
            additionalCreators: allowAdditionalCreators ? additionalCreators : undefined,
        }).then((roomId) => {
            // Register the new canopy in the Blackout discovery directory so it's
            // browsable and so canopy-scoped features (voice rooms, app installs)
            // that gate on a known canopy can be created. Only when the canopy is
            // Public or the person asked for it: a canopy that is not public is
            // not listed unless they turn the toggle on (operator decision,
            // 2026-10-17). Best-effort: the canopy already exists in Matrix
            // regardless, so a failed/blocked index must not break creation.
            if (listCanopy) {
                void indexCanopy({
                    canopyId: roomId,
                    name: roomName,
                    summary: roomTopic || undefined,
                }).catch(() => undefined);
            }
            if (alive()) {
                onCreate?.(roomId);
            }
        });
    };

    return (
        <Box as="form" onSubmit={handleSubmit} grow="Yes" direction="Column" gap="500">
            <Box direction="Column" gap="100">
                <Text size="L400">Access</Text>
                <CreateRoomKindSelector
                    value={kind}
                    onSelect={setKind}
                    canRestrict={allowRestricted}
                    disabled={disabled}
                    getIcon={getCreateSpaceKindToIcon}
                    targetLabel={BLACKOUT_TERMS.canopy.singular}
                />
                {kind === CreateRoomKind.Public && (
                    <Text size="T200" priority="300" data-testid="create-space-listed-note">
                        A public {BLACKOUT_TERMS.canopy.singular} is listed in the Blackout
                        directory.
                    </Text>
                )}
            </Box>
            <Box shrink="No" direction="Column" gap="100">
                <Text size="L400">Name</Text>
                <Input
                    required
                    before={<Icon size="100" src={getCreateSpaceKindToIcon(kind)} />}
                    name="nameInput"
                    autoFocus
                    size="500"
                    variant="SurfaceVariant"
                    radii="400"
                    autoComplete="off"
                    disabled={disabled}
                />
            </Box>
            <Box shrink="No" direction="Column" gap="100">
                <Text size="L400">Topic (Optional)</Text>
                <TextArea
                    name="topicTextAria"
                    size="500"
                    variant="SurfaceVariant"
                    radii="400"
                    disabled={disabled}
                />
            </Box>

            {kind === CreateRoomKind.Public && <CreateRoomAliasInput disabled={disabled} />}

            <Box shrink="No" direction="Column" gap="100">
                <Box gap="200" alignItems="End">
                    <Text size="L400">Options</Text>
                    <Box grow="Yes" justifyContent="End">
                        <Chip
                            radii="Pill"
                            before={
                                <Icon
                                    src={advance ? Icons.ChevronTop : Icons.ChevronBottom}
                                    size="50"
                                />
                            }
                            onClick={() => setAdvance(!advance)}
                            type="button"
                        >
                            <Text size="T200">Advanced Options</Text>
                        </Chip>
                    </Box>
                </Box>
                {allowAdditionalCreators && (
                    <SequenceCard
                        style={{ padding: config.space.S300 }}
                        variant="SurfaceVariant"
                        direction="Column"
                        gap="500"
                    >
                        <AdditionalCreatorInput
                            additionalCreators={additionalCreators}
                            onSelect={addAdditionalCreator}
                            onRemove={removeAdditionalCreator}
                        />
                    </SequenceCard>
                )}
                {kind !== CreateRoomKind.Public &&
                    advance &&
                    (allowKnock || allowKnockRestricted) && (
                        <SequenceCard
                            style={{ padding: config.space.S300 }}
                            variant="SurfaceVariant"
                            direction="Column"
                            gap="500"
                        >
                            <SettingTile
                                title="Knock to Join"
                                description={`Anyone can send a request to join this ${BLACKOUT_TERMS.canopy.singular}.`}
                                after={
                                    <Switch
                                        variant="Primary"
                                        value={knock}
                                        onChange={setKnock}
                                        disabled={disabled}
                                    />
                                }
                            />
                        </SequenceCard>
                    )}

                {kind !== CreateRoomKind.Public && (
                    <SequenceCard
                        style={{ padding: config.space.S300 }}
                        variant="SurfaceVariant"
                        direction="Column"
                        gap="500"
                    >
                        <SettingTile
                            title="List in the Blackout directory"
                            description={`Shows this ${BLACKOUT_TERMS.canopy.singular}'s name and topic to anyone browsing the directory. Who can join is still decided by the access choice above. Voice rooms and app installs need the ${BLACKOUT_TERMS.canopy.singular} to be listed.`}
                            after={
                                <Switch
                                    variant="Primary"
                                    value={listInDirectory}
                                    onChange={setListInDirectory}
                                    disabled={disabled}
                                    data-testid="create-space-list-in-directory"
                                />
                            }
                        />
                    </SequenceCard>
                )}

                <SequenceCard
                    style={{ padding: config.space.S300 }}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="500"
                >
                    <SettingTile
                        title="Allow Federation"
                        description="Users from other servers can join."
                        after={
                            <Switch
                                variant="Primary"
                                value={federation}
                                onChange={setFederation}
                                disabled={disabled}
                            />
                        }
                    />
                </SequenceCard>
                {advance && (
                    <RoomVersionSelector
                        versions={
                            roomVersions?.available ? Object.keys(roomVersions.available) : ['1']
                        }
                        value={selectedRoomVersion}
                        onChange={handleRoomVersionChange}
                        disabled={disabled}
                    />
                )}
            </Box>

            {error && (
                <Box style={{ color: color.Critical.Main }} alignItems="Center" gap="200">
                    <Icon src={Icons.Warning} filled size="100" />
                    <Text size="T300" style={{ color: color.Critical.Main }}>
                        <b>
                            {error instanceof MatrixError &&
                            error.name === ErrorCode.M_LIMIT_EXCEEDED
                                ? `Server rate-limited your request for ${millisecondsToMinutes(
                                      (error.data.retry_after_ms as number | undefined) ?? 0
                                  )} minutes!`
                                : formatMatrixError(error, error.message)}
                        </b>
                    </Text>
                </Box>
            )}
            <Box shrink="No" direction="Column" gap="200">
                <Button
                    type="submit"
                    size="500"
                    variant="Primary"
                    radii="400"
                    disabled={disabled}
                    before={loading && <Spinner variant="Primary" fill="Solid" size="200" />}
                >
                    <Text size="B500">Create</Text>
                </Button>
            </Box>
        </Box>
    );
}
