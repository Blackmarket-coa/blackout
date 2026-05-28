import React, { FormEventHandler, useEffect, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import {
    Box,
    Button,
    Chip,
    color,
    Icon,
    IconButton,
    Icons,
    Input,
    Scroll,
    Spinner,
    Text,
} from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../styles.css';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { savedHomeserversAtom, type SavedHomeserver } from '../../../state/matrixServers';
import { loadClientConfig, resolveHomeserver } from '../../../components/bmc/auth/homeserver';
import { useToast } from '../../../state/notifications/toast';

type MatrixServersProps = {
    requestClose: () => void;
};

export function MatrixServers({ requestClose }: MatrixServersProps) {
    const { showToast } = useToast();
    const [savedServers, setSavedServers] = useAtom(savedHomeserversAtom);
    const [presets, setPresets] = useState<string[]>([]);
    const [allowCustom, setAllowCustom] = useState(true);
    const [draft, setDraft] = useState('');

    useEffect(() => {
        let cancelled = false;
        void loadClientConfig().then((cfg) => {
            if (cancelled) return;
            setPresets(cfg.homeserverList ?? []);
            setAllowCustom(cfg.allowCustomHomeservers !== false);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const savedServerNames = useMemo(
        () => new Set(savedServers.map((server) => server.serverName.toLowerCase())),
        [savedServers]
    );

    const [addState, addServer] = useAsyncCallback(
        React.useCallback(
            async (rawInput: string) => {
                const resolved = await resolveHomeserver(rawInput);
                if (savedServerNames.has(resolved.serverName.toLowerCase())) {
                    throw new Error(`"${resolved.serverName}" is already in your list.`);
                }
                const next: SavedHomeserver = {
                    serverName: resolved.serverName,
                    baseUrl: resolved.baseUrl,
                    addedAt: Date.now(),
                };
                setSavedServers([...savedServers, next]);
                setDraft('');
                showToast(`Connected to ${resolved.serverName}.`, { variant: 'Success' });
                return next;
            },
            [savedServers, savedServerNames, setSavedServers, showToast]
        )
    );

    const handleAdd: FormEventHandler<HTMLFormElement> = (evt) => {
        evt.preventDefault();
        const value = draft.trim();
        if (!value) return;
        void addServer(value);
    };

    const handleRemove = (serverName: string) => {
        setSavedServers(savedServers.filter((server) => server.serverName !== serverName));
        showToast(`Removed ${serverName}.`, { variant: 'Primary' });
    };

    const adding = addState.status === AsyncStatus.Loading;
    const addErrorMessage =
        addState.status === AsyncStatus.Error
            ? addState.error instanceof Error
                ? addState.error.message
                : 'Could not connect to that homeserver.'
            : null;

    return (
        <Page>
            <PageHeader outlined={false}>
                <Box grow="Yes" gap="200">
                    <Box grow="Yes" alignItems="Center" gap="200">
                        <Text size="H3" truncate>
                            Matrix Servers
                        </Text>
                    </Box>
                    <Box shrink="No">
                        <IconButton onClick={requestClose} variant="Surface">
                            <Icon src={Icons.Cross} />
                        </IconButton>
                    </Box>
                </Box>
            </PageHeader>
            <Box grow="Yes">
                <Scroll hideTrack visibility="Hover">
                    <PageContent>
                        <Box direction="Column" gap="700">
                            <Box direction="Column" gap="100">
                                <Text size="L400">Add a server</Text>
                                <SequenceCard
                                    className={SequenceCardStyle}
                                    variant="SurfaceVariant"
                                    direction="Column"
                                    gap="300"
                                >
                                    <SettingTile
                                        title="Connect a homeserver"
                                        description={
                                            allowCustom
                                                ? 'Enter a homeserver address (e.g. matrix.org). We verify it before saving so it appears on the login screen.'
                                                : 'Custom homeservers are disabled by your operator. Only the servers below are available.'
                                        }
                                    >
                                        {allowCustom && (
                                            <form
                                                onSubmit={handleAdd}
                                                style={{
                                                    display: 'flex',
                                                    gap: 8,
                                                    alignItems: 'center',
                                                    marginTop: 8,
                                                }}
                                            >
                                                <Box grow="Yes">
                                                    <Input
                                                        value={draft}
                                                        onChange={(evt) =>
                                                            setDraft(evt.currentTarget.value)
                                                        }
                                                        placeholder="matrix.org"
                                                        variant="Secondary"
                                                        radii="300"
                                                        list="matrix-server-presets"
                                                        readOnly={adding}
                                                        autoComplete="off"
                                                        spellCheck={false}
                                                    />
                                                    {presets.length > 0 && (
                                                        <datalist id="matrix-server-presets">
                                                            {presets.map((host) => (
                                                                <option key={host} value={host} />
                                                            ))}
                                                        </datalist>
                                                    )}
                                                </Box>
                                                <Button
                                                    type="submit"
                                                    size="400"
                                                    variant="Primary"
                                                    radii="300"
                                                    disabled={adding || draft.trim().length === 0}
                                                    before={
                                                        adding ? (
                                                            <Spinner size="100" variant="Primary" fill="Soft" />
                                                        ) : (
                                                            <Icon size="100" src={Icons.Plus} />
                                                        )
                                                    }
                                                >
                                                    <Text size="B400">
                                                        {adding ? 'Connecting…' : 'Add'}
                                                    </Text>
                                                </Button>
                                            </form>
                                        )}
                                        {addErrorMessage && (
                                            <Text
                                                size="T200"
                                                style={{ color: color.Critical.Main, marginTop: 8 }}
                                            >
                                                {addErrorMessage}
                                            </Text>
                                        )}
                                    </SettingTile>
                                </SequenceCard>
                            </Box>

                            <Box direction="Column" gap="100">
                                <Text size="L400">Your servers</Text>
                                <SequenceCard
                                    className={SequenceCardStyle}
                                    variant="SurfaceVariant"
                                    direction="Column"
                                    gap="400"
                                >
                                    {savedServers.length === 0 ? (
                                        <SettingTile description="You haven't added any servers yet. Add one above to make it available when you sign in." />
                                    ) : (
                                        savedServers.map((server) => (
                                            <SettingTile
                                                key={server.serverName}
                                                before={<Icon src={Icons.Server} />}
                                                title={server.serverName}
                                                description={server.baseUrl}
                                                after={
                                                    <Chip
                                                        variant="Critical"
                                                        radii="Pill"
                                                        before={<Icon size="100" src={Icons.Delete} />}
                                                        onClick={() => handleRemove(server.serverName)}
                                                    >
                                                        <Text size="B300">Remove</Text>
                                                    </Chip>
                                                }
                                            />
                                        ))
                                    )}
                                </SequenceCard>
                            </Box>

                            {presets.length > 0 && (
                                <Box direction="Column" gap="100">
                                    <Text size="L400">Provided by your operator</Text>
                                    <SequenceCard
                                        className={SequenceCardStyle}
                                        variant="SurfaceVariant"
                                        direction="Column"
                                        gap="400"
                                    >
                                        {presets.map((host) => (
                                            <SettingTile
                                                key={host}
                                                before={<Icon src={Icons.Server} />}
                                                title={host}
                                                description="Built-in homeserver. Available on the login screen."
                                            />
                                        ))}
                                    </SequenceCard>
                                </Box>
                            )}
                        </Box>
                    </PageContent>
                </Scroll>
            </Box>
        </Page>
    );
}
