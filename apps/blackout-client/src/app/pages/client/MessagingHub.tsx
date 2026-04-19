import React from 'react';
import { Avatar, Box, Icon, Icons, Text } from 'folds';
import { useAtomValue } from 'jotai';
import { useMatch } from 'react-router-dom';
import { NavCategory, NavItem, NavItemContent, NavLink } from '../../components/nav';
import { PageNav, PageNavContent, PageNavHeader } from '../../components/page';
import { UnreadBadge } from '../../components/unread-badge';
import { useRoomsUnread } from '../../state/hooks/unread';
import { allInvitesAtom } from '../../state/room-list/inviteList';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import {
  getDirectPath,
  getInboxInvitesPath,
  getInboxNotificationsPath,
  getInboxPath,
} from '../pathUtils';
import { Direct } from './direct';
import { useDirectRooms } from './direct/useDirectRooms';

export function MessagingHub() {
  const directs = useDirectRooms();
  const directUnread = useRoomsUnread(directs, roomToUnreadAtom);
  const allInvites = useAtomValue(allInvitesAtom);
  const invitesCount = allInvites.length;

  const directSelected = !!useMatch({ path: getDirectPath(), end: false, caseSensitive: true });
  const notificationsSelected = !!useMatch({
    path: getInboxNotificationsPath(),
    end: false,
    caseSensitive: true,
  });
  const invitesSelected = !!useMatch({
    path: getInboxInvitesPath(),
    end: false,
    caseSensitive: true,
  });

  return (
    <PageNav>
      <PageNavHeader>
        <Box grow="Yes" gap="300">
          <Box grow="Yes">
            <Text size="H4" truncate>
              Messages
            </Text>
          </Box>
        </Box>
      </PageNavHeader>
      <PageNavContent>
        <Box direction="Column" gap="300">
          <NavCategory>
            <NavItem variant="Background" radii="400" aria-selected={directSelected}>
              <NavLink to={getDirectPath()}>
                <NavItemContent>
                  <Box as="span" grow="Yes" alignItems="Center" gap="200">
                    <Avatar size="200" radii="400">
                      <Icon src={Icons.User} size="100" filled={directSelected} />
                    </Avatar>
                    <Box as="span" grow="Yes">
                      <Text as="span" size="Inherit" truncate>
                        Locked In
                      </Text>
                    </Box>
                    {directUnread && (
                      <UnreadBadge
                        highlight={directUnread.highlight > 0}
                        count={directUnread.total}
                      />
                    )}
                  </Box>
                </NavItemContent>
              </NavLink>
            </NavItem>
            <NavItem variant="Background" radii="400" aria-selected={notificationsSelected}>
              <NavLink to={getInboxNotificationsPath()}>
                <NavItemContent>
                  <Box as="span" grow="Yes" alignItems="Center" gap="200">
                    <Avatar size="200" radii="400">
                      <Icon src={Icons.MessageUnread} size="100" filled={notificationsSelected} />
                    </Avatar>
                    <Box as="span" grow="Yes">
                      <Text as="span" size="Inherit" truncate>
                        Notifications
                      </Text>
                    </Box>
                  </Box>
                </NavItemContent>
              </NavLink>
            </NavItem>
            <NavItem
              variant="Background"
              radii="400"
              highlight={invitesCount > 0}
              aria-selected={invitesSelected}
            >
              <NavLink to={getInboxInvitesPath()}>
                <NavItemContent>
                  <Box as="span" grow="Yes" alignItems="Center" gap="200">
                    <Avatar size="200" radii="400">
                      <Icon src={Icons.Mail} size="100" filled={invitesSelected} />
                    </Avatar>
                    <Box as="span" grow="Yes">
                      <Text as="span" size="Inherit" truncate>
                        Invites
                      </Text>
                    </Box>
                    {invitesCount > 0 && <UnreadBadge highlight count={invitesCount} />}
                  </Box>
                </NavItemContent>
              </NavLink>
            </NavItem>
          </NavCategory>
          {directSelected && <Direct embedded hideHeader />}
          {!directSelected && !notificationsSelected && !invitesSelected && (
            <NavItem variant="Background" radii="400" aria-selected={false}>
              <NavLink to={getInboxPath()}>
                <NavItemContent>
                  <Text size="T200">Select a tab</Text>
                </NavItemContent>
              </NavLink>
            </NavItem>
          )}
        </Box>
      </PageNavContent>
    </PageNav>
  );
}
