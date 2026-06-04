import React, { useCallback, useState, type CSSProperties } from 'react';
import {
    RESOURCE_AVAILABILITY,
    SUGGESTED_RESOURCE_KINDS,
    type ResourceAvailability,
} from '@blackout/core';
import { useCoalitionResources, type CoalitionScopeQuery } from '../hooks/useCoalitionFeed';
import { createCoalitionResource, updateCoalitionResourceAvailability } from '../coalitionClient';

export interface ResourcesTabProps {
    scope: CoalitionScopeQuery;
}

const AVAILABILITY_LABEL: Record<ResourceAvailability, string> = {
    available: 'Available',
    in_use: 'In use',
    maintenance: 'Maintenance',
    retired: 'Retired',
};

const KIND_LABEL: Record<string, string> = {
    greenhouse: 'Greenhouse',
    cnc: 'CNC machine',
    '3d_printer': '3D printer',
    kitchen: 'Commercial kitchen',
    tool: 'Tool',
    other: 'Other',
};

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    height: '100%',
    minHeight: 0,
    overflowY: 'auto',
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
};

const inputStyle: CSSProperties = {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
};

const selectStyle: CSSProperties = {
    padding: 8,
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
};

const badgeStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
};

export function ResourcesTab({ scope }: ResourcesTabProps) {
    const { data, loading, error, refetch } = useCoalitionResources(scope);
    const [name, setName] = useState('');
    const [kind, setKind] = useState<string>(SUGGESTED_RESOURCE_KINDS[0]);
    const [location, setLocation] = useState('');
    const [pending, setPending] = useState(false);

    const onAdd = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed || !scope.canopyId || pending) return;
            setPending(true);
            try {
                await createCoalitionResource({
                    canopyId: scope.canopyId,
                    name: trimmed,
                    kind,
                    location: location.trim() || undefined,
                });
                setName('');
                setLocation('');
                refetch();
            } finally {
                setPending(false);
            }
        },
        [name, kind, location, scope.canopyId, pending, refetch],
    );

    const onAvailability = useCallback(
        async (id: string, availability: ResourceAvailability) => {
            await updateCoalitionResourceAvailability(id, availability);
            refetch();
        },
        [refetch],
    );

    if (!scope.canopyId) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                Open a coalition to see its resource registry.
            </div>
        );
    }

    const resources = data?.resources ?? [];

    return (
        <div style={containerStyle} data-testid="coalition-resources">
            <form
                onSubmit={onAdd}
                style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                data-testid="coalition-resource-composer"
            >
                <select
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                    style={selectStyle}
                    aria-label="Resource kind"
                >
                    {SUGGESTED_RESOURCE_KINDS.map((k) => (
                        <option key={k} value={k}>
                            {KIND_LABEL[k] ?? k}
                        </option>
                    ))}
                </select>
                <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Resource name…"
                    data-testid="coalition-resource-input"
                    style={inputStyle}
                />
                <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Location (optional)"
                    style={{ ...inputStyle, flexBasis: 160 }}
                />
                <button
                    type="submit"
                    disabled={pending || name.trim().length === 0}
                    style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--accent-primary, #1ABC9C)',
                        background: 'var(--accent-primary, #1ABC9C)',
                        color: '#fff',
                        cursor: pending ? 'progress' : 'pointer',
                    }}
                >
                    Register
                </button>
            </form>

            {error ? (
                <div style={{ color: 'var(--danger)', fontSize: 13 }}>
                    Couldn't load resources: {error}
                </div>
            ) : null}
            {loading && !data ? <div style={{ color: 'var(--text-secondary)' }}>Loading…</div> : null}
            {!loading && resources.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    No shared resources registered yet.
                </div>
            ) : null}

            {resources.map((resource) => (
                <article
                    key={resource.id}
                    style={cardStyle}
                    data-testid="coalition-resource-card"
                    data-resource-id={resource.id}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={badgeStyle}>{KIND_LABEL[resource.kind] ?? resource.kind}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{resource.name}</span>
                        <span style={badgeStyle}>{AVAILABILITY_LABEL[resource.availability]}</span>
                    </div>
                    {resource.location ? (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            📍 {resource.location}
                        </span>
                    ) : null}
                    {resource.description ? (
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                            {resource.description}
                        </p>
                    ) : null}
                    <select
                        value={resource.availability}
                        onChange={(event) =>
                            onAvailability(resource.id, event.target.value as ResourceAvailability)
                        }
                        style={{ ...selectStyle, alignSelf: 'flex-start' }}
                        aria-label="Update resource availability"
                    >
                        {RESOURCE_AVAILABILITY.map((availability) => (
                            <option key={availability} value={availability}>
                                {AVAILABILITY_LABEL[availability]}
                            </option>
                        ))}
                    </select>
                </article>
            ))}
        </div>
    );
}

export default ResourcesTab;
