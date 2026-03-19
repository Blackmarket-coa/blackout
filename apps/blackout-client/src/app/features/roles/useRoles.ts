import { useCallback, useMemo } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoom } from '../../hooks/useRoom';
import { getPowerLevel } from '../../utils/room';

export interface RoleDefinition {
  name: string;
  powerLevel: number;
  color: string;
  icon?: string;
  permissions: string[];
  isDefault?: boolean;
  position: number;
}

interface RolesEventContent {
  roles?: RoleDefinition[];
}

const ROLES_EVENT_TYPE = 'co.bmc.roles';

const normalizeRole = (role: RoleDefinition, index: number): RoleDefinition => ({
  name: role.name.trim() || `Role ${index + 1}`,
  powerLevel: Math.max(0, Math.min(100, Math.round(role.powerLevel))),
  color: role.color || '#9CA3AF',
  icon: role.icon,
  permissions: role.permissions,
  isDefault: role.isDefault,
  position: role.position,
});

const defaultRolesFromPowerLevels = (): RoleDefinition[] => [
  {
    name: 'Owner',
    powerLevel: 100,
    color: '#EF4444',
    permissions: ['admin', 'manage_roles', 'manage_room'],
    position: 0,
  },
  {
    name: 'Moderator',
    powerLevel: 50,
    color: '#F97316',
    permissions: ['moderate', 'kick', 'ban'],
    position: 1,
  },
  {
    name: 'Member',
    powerLevel: 1,
    color: '#60A5FA',
    permissions: ['send_messages', 'react'],
    isDefault: true,
    position: 2,
  },
  {
    name: 'Guest',
    powerLevel: 0,
    color: '#9CA3AF',
    permissions: ['read'],
    isDefault: true,
    position: 3,
  },
].map((role) => ({ ...role, permissions: [...role.permissions] }));

const sortRoles = (roles: RoleDefinition[]): RoleDefinition[] => {
  return [...roles]
    .sort((a, b) => a.position - b.position || b.powerLevel - a.powerLevel)
    .map((role, index) => normalizeRole({ ...role, position: index }, index));
};

const readRolesEvent = (room: ReturnType<typeof useRoom>['data']): RoleDefinition[] | null => {
  if (!room) return null;
  const event = room.currentState.getStateEvents(ROLES_EVENT_TYPE, '');
  if (!event) return null;

  const content = event.getContent<RolesEventContent>();
  if (!Array.isArray(content.roles)) return null;

  const valid = content.roles.filter((role): role is RoleDefinition => {
    if (!role || typeof role !== 'object') return false;
    return typeof role.name === 'string' && typeof role.powerLevel === 'number' && typeof role.color === 'string' && Array.isArray(role.permissions);
  });

  if (valid.length === 0) return null;
  return sortRoles(valid);
};

const resolveRoleForPower = (roles: RoleDefinition[], power: number): RoleDefinition | null => {
  const byThreshold = [...roles].sort((a, b) => b.powerLevel - a.powerLevel);
  return byThreshold.find((role) => power >= role.powerLevel) ?? null;
};

export const useRoles = (roomId: string) => {
  const roomState = useRoom(roomId);

  return useMemo(() => {
    const rolesFromEvent = readRolesEvent(roomState.data);
    const roles = rolesFromEvent ?? defaultRolesFromPowerLevels();

    return {
      data: roles,
      loading: roomState.loading,
      error: roomState.error,
      source: rolesFromEvent ? 'co.bmc.roles' : 'derived',
    };
  }, [roomId, roomState.data, roomState.error, roomState.loading]);
};

export const useUserRoles = (roomId: string, userId: string) => {
  const rolesResult = useRoles(roomId);
  const roomState = useRoom(roomId);

  return useMemo(() => {
    if (!roomState.data) {
      return {
        data: [] as RoleDefinition[],
        loading: roomState.loading || rolesResult.loading,
        error: roomState.error ?? rolesResult.error,
        powerLevel: 0,
      };
    }

    const powerLevel = getPowerLevel(roomState.data, userId);
    const role = resolveRoleForPower(rolesResult.data, powerLevel);

    return {
      data: role ? [role] : [],
      loading: roomState.loading || rolesResult.loading,
      error: roomState.error ?? rolesResult.error,
      powerLevel,
    };
  }, [roomState.data, roomState.error, roomState.loading, rolesResult.data, rolesResult.error, rolesResult.loading, userId]);
};

export const useSetRole = (roomId: string) => {
  const client = useMatrixClient();
  const roomState = useRoom(roomId);

  return useCallback(
    async (userId: string, role: RoleDefinition | null) => {
      const room = roomState.data;
      if (!room) throw new Error('Room unavailable.');

      const powerEvent = room.currentState.getStateEvents('m.room.power_levels', '');
      const content = (powerEvent?.getContent<Record<string, unknown>>() ?? {}) as Record<string, unknown>;
      const users = { ...((content.users as Record<string, number> | undefined) ?? {}) };

      if (role) {
        users[userId] = role.powerLevel;
      } else {
        delete users[userId];
      }

      await client.sendStateEvent(roomId, 'm.room.power_levels', { ...content, users }, '');
    },
    [client, roomId, roomState.data],
  );
};

export const useManageRoles = (roomId: string) => {
  const client = useMatrixClient();
  const roles = useRoles(roomId);

  const writeRoles = useCallback(
    async (nextRoles: RoleDefinition[]) => {
      await client.sendStateEvent(
        roomId,
        ROLES_EVENT_TYPE,
        {
          roles: sortRoles(nextRoles),
        },
        '',
      );
    },
    [client, roomId],
  );

  const createRole = useCallback(
    async (role: Omit<RoleDefinition, 'position'>) => {
      const next = [...roles.data, { ...role, position: roles.data.length }];
      await writeRoles(next);
    },
    [roles.data, writeRoles],
  );

  const updateRole = useCallback(
    async (position: number, updates: Partial<RoleDefinition>) => {
      const next = roles.data.map((role) => (role.position === position ? { ...role, ...updates } : role));
      await writeRoles(next);
    },
    [roles.data, writeRoles],
  );

  const deleteRole = useCallback(
    async (position: number) => {
      const next = roles.data.filter((role) => role.position !== position);
      await writeRoles(next);
    },
    [roles.data, writeRoles],
  );

  const reorderRoles = useCallback(
    async (from: number, to: number) => {
      const sorted = [...roles.data].sort((a, b) => a.position - b.position);
      const [moved] = sorted.splice(from, 1);
      if (!moved) return;
      sorted.splice(to, 0, moved);
      await writeRoles(sorted.map((role, index) => ({ ...role, position: index })));
    },
    [roles.data, writeRoles],
  );

  return {
    ...roles,
    createRole,
    updateRole,
    deleteRole,
    reorderRoles,
    writeRoles,
  };
};

export { ROLES_EVENT_TYPE };
