import React, { KeyboardEventHandler, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import { Method, RoomType } from 'matrix-js-sdk';
import { useParams, useSearchParams } from 'react-router';
import { Avatar, Box, Button, Chip, Icon, Icons, Scroll, Text, color } from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useViewportWidth } from '../../hooks/useViewportWidth';
import { isMobileViewport } from '../../pages/client/layoutMetrics';
import { allRoomsAtom } from '../../state/room-list/roomList';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { mDirectAtom } from '../../state/mDirectList';
import { useSpaces, useChildRoomScopeFactory, useSpaceChildren } from '../../state/hooks/roomList';
import { useSpaceHierarchy } from '../../hooks/useSpaceHierarchy';
import { RoomType as MatrixRoomType } from '../../../types/matrix/room';
import { Page, PageContent, PageContentCenter, PageHeader } from '../../components/page';
import {
    DiscoveryFilters,
    DiscoveryItem,
    DiscoverySort,
    getNextKeyboardIndex,
    isLikelySandbox,
    performDiscoveryAction,
    rankDiscoveryItems,
} from './model';
import { GlobalSearchPanel } from './GlobalSearchPanel';
import { useDiscoveryInterestTags } from '../home/discoveryInterests';

const DEFAULT_FILTERS: DiscoveryFilters = {
    type: 'all',
    access: 'all',
    activity: 'all',
    includeEmpty: false,
};

const SORT_OPTIONS: Array<{ label: string; value: DiscoverySort }> = [
    { label: 'Recency', value: 'recency' },
    { label: 'Relevance', value: 'relevance' },
    { label: 'Member Count', value: 'member_count' },
    { label: 'New to You', value: 'new_to_you' },
];

export type DiscoverySurfaceProps = {
    onSelectRoom?: (roomId: string) => void;
    onSelectSpace?: (spaceId: string) => void;
};

export function DiscoverySurface({ onSelectRoom, onSelectSpace }: DiscoverySurfaceProps = {}) {
    const { server } = useParams();
    const mx = useMatrixClient();
    const allRooms = useAtomValue(allRoomsAtom);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const mDirects = useAtomValue(mDirectAtom);
    const joinedSpaces = useSpaces(mx, allRoomsAtom);
    const interestTagsSet = useDiscoveryInterestTags();
    const interestTags = useMemo(() => [...interestTagsSet], [interestTagsSet]);
    const rootSpaceId = joinedSpaces[0] ?? '__blackout_discovery__';
    const childRoomScopeFactory = useChildRoomScopeFactory(mx, mDirects, roomToParents);
    const spaceChildren = useSpaceChildren(allRoomsAtom, rootSpaceId, childRoomScopeFactory);
    const hierarchy = useSpaceHierarchy(
        rootSpaceId,
        new Set(joinedSpaces),
        (roomId) => mx.getRoom(roomId) ?? undefined,
        () => false
    );

    const [searchParams] = useSearchParams();
    const searchTerm = searchParams.get('term') ?? undefined;

    const [filters, setFilters] = useState<DiscoveryFilters>(DEFAULT_FILTERS);
    const [sort, setSort] = useState<DiscoverySort>('recency');
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const { navigateRoom, navigateSpace } = useRoomNavigate();
    // DiscoverySurface lives in the AppShell tree (no ScreenSizeProvider), so use
    // the provider-free viewport hook the rest of that tree uses. On phones the
    // two-pane row squeezes the join action off-screen; stack it instead so the
    // full-width "Join & Open" button sits directly under the results list.
    const viewportWidth = useViewportWidth();
    const isMobile = isMobileViewport(viewportWidth);

    const { data, isLoading, error } = useQuery({
        queryKey: ['discovery', server, searchTerm],
        queryFn: async () =>
            mx.http.authedRequest<{ chunk: Array<Record<string, unknown>> }>(
                Method.Post,
                '/publicRooms',
                { server },
                {
                    limit: 64,
                    filter: { generic_search_term: searchTerm },
                }
            ),
        retry: false,
    });

    const friendlyError = useMemo(() => {
        if (!error) return undefined;
        const err = error as { errcode?: string; httpStatus?: number; message?: string };
        if (err.errcode === 'M_UNKNOWN_TOKEN' || err.httpStatus === 401) {
            return 'Your session has expired. Please sign out and sign back in to browse public rooms.';
        }
        if (err.httpStatus === 403 || err.errcode === 'M_FORBIDDEN') {
            return 'This homeserver does not allow browsing public rooms.';
        }
        return err.message ?? 'Failed to load discovery rooms.';
    }, [error]);

    const hierarchyRoomMeta = useMemo(() => {
        const metadata = new Map<string, { ts: number; parents: string[] }>();
        hierarchy.forEach((entry) => {
            if (!entry.rooms) return;
            entry.rooms.forEach((room) => {
                metadata.set(room.roomId, {
                    ts: room.ts,
                    parents: [entry.space.roomId],
                });
            });
        });
        return metadata;
    }, [hierarchy]);

    const discoveryItems = useMemo<DiscoveryItem[]>(() => {
        const joined = new Set(allRooms);
        const fromServer = (data?.chunk ?? []).map((room) => {
            const roomId = String(room.room_id);
            const alias = typeof room.canonical_alias === 'string' ? room.canonical_alias : roomId;
            const roomType = typeof room.room_type === 'string' ? room.room_type : undefined;
            const hierarchyMeta = hierarchyRoomMeta.get(roomId);

            return {
                roomId,
                roomIdOrAlias: alias,
                name: String(room.name ?? alias),
                topic: typeof room.topic === 'string' ? room.topic : undefined,
                roomType,
                memberCount: Number(room.num_joined_members ?? 0),
                joined: joined.has(roomId),
                joinRule: typeof room.join_rule === 'string' ? room.join_rule : undefined,
                worldReadable: Boolean(room.world_readable),
                lastActivityTs: hierarchyMeta?.ts ?? 0,
                inHierarchy: Boolean(hierarchyMeta) || spaceChildren.includes(roomId),
                parentSpaceIds: hierarchyMeta?.parents ?? [],
            } satisfies DiscoveryItem;
        });

        return rankDiscoveryItems(fromServer, filters, sort, searchTerm);
    }, [allRooms, data?.chunk, filters, hierarchyRoomMeta, searchTerm, sort, spaceChildren]);

    const selectedItem =
        discoveryItems.find((item) => item.roomId === selectedRoomId) ?? discoveryItems[0];

    const onItemKeyDown =
        (index: number): KeyboardEventHandler<HTMLButtonElement> =>
        (evt) => {
            if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(evt.key)) return;
            evt.preventDefault();
            const nextIndex = getNextKeyboardIndex(
                index,
                discoveryItems.length,
                evt.key as 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'
            );
            const next = discoveryItems[nextIndex];
            if (next) setSelectedRoomId(next.roomId);
        };

    const openOrJoin = async (item: DiscoveryItem) => {
        await performDiscoveryAction(item, {
            joinRoom: (roomIdOrAlias, viaServers) => mx.joinRoom(roomIdOrAlias, { viaServers }),
            openRoom: onSelectRoom ?? navigateRoom,
            openSpace: onSelectSpace ?? navigateSpace,
        });
    };

    return (
        <Page>
            <PageHeader>
                <Text size="H3">Discovery</Text>
            </PageHeader>
            <PageContent>
                <PageContentCenter>
                    <Box direction="Column" gap="300">
                        <GlobalSearchPanel interestTags={interestTags} excludeIds={joinedSpaces} />
                        <Box direction="Column" gap="200">
                            <Text size="L400">Filter chips</Text>
                            <Box gap="100" wrap="Wrap">
                                {(['all', 'rooms', 'spaces'] as const).map((value) => (
                                    <Chip
                                        key={value}
                                        aria-pressed={filters.type === value}
                                        variant={filters.type === value ? 'Success' : 'Surface'}
                                        onClick={() =>
                                            setFilters((prev) => ({ ...prev, type: value }))
                                        }
                                    >
                                        <Text size="T200">Type: {value}</Text>
                                    </Chip>
                                ))}
                                {(['all', 'joined', 'joinable', 'invite'] as const).map((value) => (
                                    <Chip
                                        key={value}
                                        aria-pressed={filters.access === value}
                                        variant={filters.access === value ? 'Success' : 'Surface'}
                                        onClick={() =>
                                            setFilters((prev) => ({ ...prev, access: value }))
                                        }
                                    >
                                        <Text size="T200">Access: {value}</Text>
                                    </Chip>
                                ))}
                                {(['all', 'active', 'quiet'] as const).map((value) => (
                                    <Chip
                                        key={value}
                                        aria-pressed={filters.activity === value}
                                        variant={filters.activity === value ? 'Success' : 'Surface'}
                                        onClick={() =>
                                            setFilters((prev) => ({ ...prev, activity: value }))
                                        }
                                    >
                                        <Text size="T200">Activity: {value}</Text>
                                    </Chip>
                                ))}
                                <Chip
                                    aria-pressed={filters.includeEmpty === true}
                                    variant={filters.includeEmpty ? 'Success' : 'Surface'}
                                    onClick={() =>
                                        setFilters((prev) => ({
                                            ...prev,
                                            includeEmpty: !prev.includeEmpty,
                                        }))
                                    }
                                >
                                    <Text size="T200">Include empty</Text>
                                </Chip>
                            </Box>
                        </Box>

                        <Box direction="Column" gap="200">
                            <Text size="L400">Sort options</Text>
                            <Box gap="100" wrap="Wrap">
                                {SORT_OPTIONS.map((option) => (
                                    <Chip
                                        key={option.value}
                                        aria-pressed={sort === option.value}
                                        variant={sort === option.value ? 'Success' : 'Surface'}
                                        onClick={() => setSort(option.value)}
                                    >
                                        <Text size="T200">{option.label}</Text>
                                    </Chip>
                                ))}
                            </Box>
                        </Box>

                        {friendlyError && (
                            <Text style={{ color: color.Critical.Main }}>{friendlyError}</Text>
                        )}

                        <Box
                            gap="300"
                            direction={isMobile ? 'Column' : 'Row'}
                            alignItems={isMobile ? 'Stretch' : 'Start'}
                            data-testid="discovery-two-pane"
                        >
                            <Box
                                direction="Column"
                                gap="100"
                                data-testid="discovery-list-pane"
                                style={
                                    isMobile
                                        ? { minWidth: 0, width: '100%' }
                                        : { flex: '2 1 0', minWidth: 0 }
                                }
                            >
                                <Scroll hideTrack visibility="Hover" size="0">
                                    <Box
                                        direction="Column"
                                        gap="100"
                                        role="listbox"
                                        aria-label="Discovery results"
                                    >
                                        {isLoading && <Text>Loading discovery…</Text>}
                                        {!isLoading && discoveryItems.length === 0 && (
                                            <Text>No discovery results found.</Text>
                                        )}
                                        {discoveryItems.map((item, index) => (
                                            <Button
                                                key={item.roomId}
                                                role="option"
                                                aria-selected={selectedItem?.roomId === item.roomId}
                                                variant={
                                                    selectedItem?.roomId === item.roomId
                                                        ? 'Primary'
                                                        : 'Secondary'
                                                }
                                                fill={
                                                    selectedItem?.roomId === item.roomId
                                                        ? 'Soft'
                                                        : 'None'
                                                }
                                                style={{ justifyContent: 'flex-start' }}
                                                onKeyDown={onItemKeyDown(index)}
                                                onClick={() => setSelectedRoomId(item.roomId)}
                                            >
                                                <Box
                                                    as="span"
                                                    alignItems="Center"
                                                    gap="200"
                                                    grow="Yes"
                                                >
                                                    <Avatar size="200">
                                                        <Icon
                                                            src={
                                                                item.roomType === RoomType.Space
                                                                    ? Icons.Space
                                                                    : Icons.Hash
                                                            }
                                                        />
                                                    </Avatar>
                                                    <Box
                                                        as="span"
                                                        direction="Column"
                                                        alignItems="Start"
                                                        grow="Yes"
                                                    >
                                                        <Text size="L400" truncate>
                                                            {item.name}
                                                        </Text>
                                                        <Text size="T200" truncate>
                                                            {item.memberCount} members
                                                        </Text>
                                                    </Box>
                                                    {item.inHierarchy && (
                                                        <Chip variant="Success">
                                                            <Text size="T200">In hierarchy</Text>
                                                        </Chip>
                                                    )}
                                                    {isLikelySandbox(item) && (
                                                        <Chip variant="Surface">
                                                            <Text size="T200">Sandbox</Text>
                                                        </Chip>
                                                    )}
                                                </Box>
                                            </Button>
                                        ))}
                                    </Box>
                                </Scroll>
                            </Box>

                            <Box
                                direction="Column"
                                gap="200"
                                data-testid="discovery-preview-pane"
                                style={
                                    isMobile
                                        ? { minWidth: 0, width: '100%' }
                                        : { flex: '1 1 0', minWidth: 0 }
                                }
                            >
                                <Text size="L400">Inline join preview</Text>
                                {selectedItem ? (
                                    <Box direction="Column" gap="100">
                                        <Text size="H4">{selectedItem.name}</Text>
                                        <Text size="T300">{selectedItem.topic ?? 'No topic'}</Text>
                                        <Text size="T200">
                                            Type:{' '}
                                            {selectedItem.roomType === MatrixRoomType.Space
                                                ? 'Space'
                                                : 'Room'}
                                        </Text>
                                        <Text size="T200">
                                            Parent spaces: {selectedItem.parentSpaceIds.length}
                                        </Text>
                                        <Button
                                            variant="Primary"
                                            onClick={() => openOrJoin(selectedItem)}
                                        >
                                            <Text size="B300">
                                                {selectedItem.joined ? 'Open' : 'Join & Open'}
                                            </Text>
                                        </Button>
                                    </Box>
                                ) : (
                                    <Text size="T300">Select a room to preview.</Text>
                                )}
                            </Box>
                        </Box>
                    </Box>
                </PageContentCenter>
            </PageContent>
        </Page>
    );
}
