import React from 'react';
import { Avatar, Box, Text } from 'folds';
import { useMatch } from 'react-router';
import { NavCategory, NavItem, NavItemContent, NavLink } from '../../../components/nav';
import { UnreadBadge } from '../../../components/unread-badge';
import { RoomAvatar } from '../../../components/room-avatar';
import { useRoomUnread } from '../../../state/hooks/unread';
import { roomToUnreadAtom } from '../../../state/room/roomToUnread';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getDirectRoomPath } from '../../pathUtils';
import { getCanonicalAliasOrRoomId } from '../../../utils/matrix';
import { nameInitials } from '../../../utils/common';
import { useDirectRooms } from './useDirectRooms';

type DirectRoomNavItemProps = {
    roomId: string;
};

function DirectRoomNavItem({ roomId }: DirectRoomNavItemProps) {
    const mx = useMatrixClient();
    const room = mx.getRoom(roomId);
    const unread = useRoomUnread(roomId, roomToUnreadAtom);
    const path = getDirectRoomPath(getCanonicalAliasOrRoomId(mx, roomId));
    const selected = !!useMatch({ path, end: false, caseSensitive: true });

    if (!room) return null;

    return (
        <NavItem variant="Background" radii="400" aria-selected={selected}>
            <NavLink to={path}>
                <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" gap="200">
                        <Avatar size="200" radii="400">
                            <RoomAvatar
                                roomId={roomId}
                                src={undefined}
                                alt={room.name}
                                renderFallback={() => (
                                    <Text as="span" size="H6">
                                        {nameInitials(room.name)}
                                    </Text>
                                )}
                            />
                        </Avatar>
                        <Box as="span" grow="Yes">
                            <Text as="span" size="Inherit" truncate>
                                {room.name || roomId}
                            </Text>
                        </Box>
                        {unread && (
                            <UnreadBadge highlight={unread.highlight > 0} count={unread.total} />
                        )}
                    </Box>
                </NavItemContent>
            </NavLink>
        </NavItem>
    );
}

type DirectProps = {
    embedded?: boolean;
    hideHeader?: boolean;
};

export function Direct({ embedded = false, hideHeader = false }: DirectProps) {
    const directs = useDirectRooms();

    if (directs.length === 0) {
        return embedded ? null : (
            <Box direction="Column" gap="200">
                {!hideHeader && (
                    <Text size="L400" priority="300">
                        No direct messages yet.
                    </Text>
                )}
            </Box>
        );
    }

    return (
        <Box direction="Column" gap="200">
            {!hideHeader && (
                <Text size="L400" priority="300">
                    Direct messages
                </Text>
            )}
            <NavCategory>
                {directs.map((roomId) => (
                    <DirectRoomNavItem key={roomId} roomId={roomId} />
                ))}
            </NavCategory>
        </Box>
    );
}

export default Direct;
