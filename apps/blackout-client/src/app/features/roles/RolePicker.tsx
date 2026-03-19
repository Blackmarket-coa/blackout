import { useMemo } from 'react';
import { useMyPowerLevel } from '../../hooks/usePowerLevels';
import { useRoles, useSetRole, useUserRoles, type RoleDefinition } from './useRoles';

export const RolePicker = ({ roomId, userId }: { roomId: string; userId: string }) => {
  const roles = useRoles(roomId);
  const setRole = useSetRole(roomId);
  const targetUserRoles = useUserRoles(roomId, userId);
  const myPower = useMyPowerLevel(roomId);

  const currentRole = targetUserRoles.data[0] ?? null;

  const visibleRoles = useMemo(
    () => roles.data.filter((role) => role.powerLevel < myPower.data).sort((a, b) => a.position - b.position),
    [myPower.data, roles.data],
  );

  const onPickRole = async (role: RoleDefinition | null) => {
    await setRole(userId, role);
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)' }}>Assign role</span>
        <select
          value={currentRole?.position ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            const next = visibleRoles.find((role) => String(role.position) === value) ?? null;
            void onPickRole(next);
          }}
          style={{ border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '6px 8px' }}
        >
          <option value="">No explicit role</option>
          {visibleRoles.map((role) => (
            <option key={role.position} value={role.position}>{role.name} (PL {role.powerLevel})</option>
          ))}
        </select>
      </label>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {visibleRoles.map((role) => {
          const active = currentRole?.position === role.position;
          return (
            <button
              key={role.position}
              type="button"
              onClick={() => void onPickRole(active ? null : role)}
              style={{
                border: `1px solid ${active ? role.color : 'var(--border-default)'}`,
                background: active ? 'var(--accent-muted)' : 'var(--bg-input)',
                color: role.color,
                borderRadius: 999,
                padding: '4px 8px',
                fontSize: 12,
              }}
            >
              {role.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RolePicker;
