import { useMemo } from 'react';
import { StateEvent } from '../../../../types/matrix/room';
import { PermissionGroup } from '../../common-settings/permissions';
import { BLACKOUT_TERMS } from '../../../lib/blackoutTerminology';

export const usePermissionGroups = (): PermissionGroup[] => {
  const groups: PermissionGroup[] = useMemo(() => {
    const messagesGroup: PermissionGroup = {
      name: 'Manage',
      items: [
        {
          location: {
            state: true,
            key: StateEvent.SpaceChild,
          },
          name: `Manage ${BLACKOUT_TERMS.canopy.singular} ${BLACKOUT_TERMS.den.plural}`,
        },
        {
          location: {},
          name: 'Message Events',
        },
      ],
    };

    const moderationGroup: PermissionGroup = {
      name: 'Moderation',
      items: [
        {
          location: {
            action: true,
            key: 'invite',
          },
          name: 'Invite',
        },
        {
          location: {
            action: true,
            key: 'kick',
          },
          name: 'Kick',
        },
        {
          location: {
            action: true,
            key: 'ban',
          },
          name: 'Ban',
        },
      ],
    };

    const roomOverviewGroup: PermissionGroup = {
      name: `${BLACKOUT_TERMS.canopy.title} Overview`,
      items: [
        {
          location: {
            state: true,
            key: StateEvent.RoomAvatar,
          },
          name: `${BLACKOUT_TERMS.canopy.title} Avatar`,
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomName,
          },
          name: `${BLACKOUT_TERMS.canopy.title} Name`,
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomTopic,
          },
          name: `${BLACKOUT_TERMS.canopy.title} Topic`,
        },
      ],
    };

    const roomSettingsGroup: PermissionGroup = {
      name: 'Settings',
      items: [
        {
          location: {
            state: true,
            key: StateEvent.RoomJoinRules,
          },
          name: `Change ${BLACKOUT_TERMS.canopy.title} Access`,
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomCanonicalAlias,
          },
          name: 'Publish Address',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomPowerLevels,
          },
          name: 'Change All Permission',
        },
        {
          location: {
            state: true,
            key: StateEvent.PowerLevelTags,
          },
          name: 'Edit Power Levels',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomTombstone,
          },
          name: `Upgrade ${BLACKOUT_TERMS.canopy.title}`,
        },
        {
          location: {
            state: true,
          },
          name: 'Other Settings',
        },
      ],
    };

    const otherSettingsGroup: PermissionGroup = {
      name: 'Other',
      items: [
        {
          location: {
            state: true,
            key: StateEvent.PoniesRoomEmotes,
          },
          name: 'Manage Emojis & Stickers',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomServerAcl,
          },
          name: 'Change Server ACLs',
        },
      ],
    };

    return [
      messagesGroup,
      moderationGroup,
      roomOverviewGroup,
      roomSettingsGroup,
      otherSettingsGroup,
    ];
  }, []);

  return groups;
};
