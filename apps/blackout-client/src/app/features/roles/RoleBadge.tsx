import type { CSSProperties } from 'react';
import type { RoleDefinition } from './useRoles';

export const RoleBadge = ({
    role,
    fallbackName,
    compact,
}: {
    role: RoleDefinition | null;
    fallbackName?: string;
    compact?: boolean;
}) => {
    if (!role && !fallbackName) return null;

    const style: CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        padding: compact ? '1px 6px' : '2px 8px',
        border: `1px solid ${role?.color ?? 'var(--border-default)'}`,
        color: role?.color ?? 'var(--text-primary)',
        fontSize: compact ? 11 : 12,
        lineHeight: 1.2,
    };

    return (
        <span style={style} title={role?.permissions.join(', ') || undefined}>
            {role?.icon ? (
                <img
                    src={role.icon}
                    alt={`${role.name} badge`}
                    style={{ width: compact ? 12 : 14, height: compact ? 12 : 14, borderRadius: 2 }}
                />
            ) : null}
            <span>{role?.name ?? fallbackName}</span>
        </span>
    );
};

export default RoleBadge;
