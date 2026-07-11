import { type DragEvent, useMemo, useState } from 'react';
import { Badge, Button, Card, Checkbox, Input } from '@blackout/ui/primitives';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useManageRoles, type RoleDefinition } from './useRoles';
import { useConfirm } from '../../components/confirm-dialog';

const AVAILABLE_PERMISSIONS = [
    'send_messages',
    'react',
    'manage_room',
    'manage_roles',
    'kick',
    'ban',
    'invite',
    'moderate',
];

const emptyDraft: Omit<RoleDefinition, 'position'> = {
    name: '',
    powerLevel: 1,
    color: '#60A5FA',
    icon: '',
    permissions: ['send_messages', 'react'],
    isDefault: false,
};

export const RoleEditor = ({ roomId }: { roomId: string }) => {
    const client = useMatrixClient();
    const {
        data: roles,
        createRole,
        updateRole,
        deleteRole,
        reorderRoles,
        source,
    } = useManageRoles(roomId);
    const [draft, setDraft] = useState<Omit<RoleDefinition, 'position'>>(emptyDraft);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const confirm = useConfirm();

    const orderedRoles = useMemo(() => [...roles].sort((a, b) => a.position - b.position), [roles]);

    const onUploadIcon = async (file: File): Promise<string | undefined> => {
        if (!file) return undefined;
        const uploadResponse = (await client.uploadContent(file, {
            includeFilename: true,
            type: file.type,
        })) as string | { content_uri?: string };

        if (typeof uploadResponse === 'string') return uploadResponse;
        return uploadResponse.content_uri;
    };

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <header>
                <h3 style={{ margin: 0 }}>Role Editor</h3>
                <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>
                    Roles are stored in the <code>co.bmc.roles</code> room state event.
                    {source === 'derived'
                        ? ' No event exists yet, defaults are currently derived from power levels.'
                        : ''}
                </p>
            </header>

            <Card style={{ display: 'grid', gap: 10 }}>
                <strong>Create role</strong>
                <div style={{ display: 'grid', gap: 8 }}>
                    <Input
                        value={draft.name}
                        onChange={(event) =>
                            setDraft((prev) => ({ ...prev, name: event.target.value }))
                        }
                        placeholder="Role name"
                    />

                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        Power level: {draft.powerLevel}
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={draft.powerLevel}
                            onChange={(event) =>
                                setDraft((prev) => ({
                                    ...prev,
                                    powerLevel: Number(event.target.value),
                                }))
                            }
                        />
                    </label>

                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        Color
                        <input
                            type="color"
                            value={draft.color || '#60A5FA'}
                            onChange={(event) =>
                                setDraft((prev) => ({ ...prev, color: event.target.value }))
                            }
                        />
                    </label>

                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        Icon
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                if (!file) return;
                                void onUploadIcon(file).then((url) => {
                                    if (url) setDraft((prev) => ({ ...prev, icon: url }));
                                });
                            }}
                        />
                    </label>

                    <fieldset
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            padding: 8,
                        }}
                    >
                        <legend style={{ fontSize: 12 }}>Permissions</legend>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                                gap: 4,
                            }}
                        >
                            {AVAILABLE_PERMISSIONS.map((permission) => {
                                const checked = draft.permissions.includes(permission);
                                return (
                                    <Checkbox
                                        key={permission}
                                        label={permission}
                                        checked={checked}
                                        onChange={(event) => {
                                            const next = event.target.checked
                                                ? [...draft.permissions, permission]
                                                : draft.permissions.filter(
                                                      (item) => item !== permission
                                                  );
                                            setDraft((prev) => ({
                                                ...prev,
                                                permissions: next,
                                            }));
                                        }}
                                    />
                                );
                            })}
                        </div>
                    </fieldset>

                    <Checkbox
                        label="Auto-assign on join"
                        checked={Boolean(draft.isDefault)}
                        onChange={(event) =>
                            setDraft((prev) => ({ ...prev, isDefault: event.target.checked }))
                        }
                    />

                    <Button
                        tone="primary"
                        loading={saving}
                        disabled={saving || !draft.name.trim()}
                        onClick={() => {
                            setSaving(true);
                            void createRole(draft).finally(() => {
                                setDraft(emptyDraft);
                                setSaving(false);
                            });
                        }}
                    >
                        {saving ? 'Saving…' : 'Create role'}
                    </Button>
                </div>
            </Card>

            <div
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    overflow: 'hidden',
                }}
            >
                {orderedRoles.map((role, index) => (
                    <article
                        key={role.position}
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(event: DragEvent<HTMLElement>) => event.preventDefault()}
                        onDrop={() => {
                            if (dragIndex === null || dragIndex === index) return;
                            void reorderRoles(dragIndex, index);
                            setDragIndex(null);
                        }}
                        style={{
                            borderBottom:
                                index === orderedRoles.length - 1
                                    ? 'none'
                                    : '1px solid var(--border-default)',
                            padding: 10,
                            display: 'grid',
                            gap: 8,
                            background: 'var(--bg-input)',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <strong style={{ color: role.color }}>{role.name}</strong>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                PL {role.powerLevel}
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {role.permissions.map((permission) => (
                                <Badge key={permission}>{permission}</Badge>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                                type="color"
                                value={role.color || '#9CA3AF'}
                                onChange={(event) =>
                                    void updateRole(role.position, { color: event.target.value })
                                }
                                title="Role color"
                            />
                            <Input
                                value={role.name}
                                onChange={(event) =>
                                    void updateRole(role.position, { name: event.target.value })
                                }
                                style={{ flex: 1 }}
                            />
                            <Button
                                tone="danger"
                                size="sm"
                                onClick={() => {
                                    void (async () => {
                                        const confirmed = await confirm({
                                            title: 'Delete role?',
                                            description: (
                                                <>
                                                    Are you sure you want to delete the role{' '}
                                                    <strong>{role.name}</strong>? Members assigned
                                                    to this role will lose its permissions.
                                                </>
                                            ),
                                            confirmLabel: 'Delete',
                                        });
                                        if (!confirmed) return;
                                        void deleteRole(role.position);
                                    })();
                                }}
                            >
                                Delete
                            </Button>
                        </div>

                        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                            Power level: {role.powerLevel}
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={role.powerLevel}
                                onChange={(event) =>
                                    void updateRole(role.position, {
                                        powerLevel: Number(event.target.value),
                                    })
                                }
                            />
                        </label>

                        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                            Icon
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(event) => {
                                    const file = event.currentTarget.files?.[0];
                                    if (!file) return;
                                    void onUploadIcon(file).then((mxcUri) => {
                                        if (!mxcUri) return;
                                        void updateRole(role.position, { icon: mxcUri });
                                    });
                                }}
                            />
                        </label>

                        <fieldset
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                padding: 8,
                            }}
                        >
                            <legend style={{ fontSize: 12 }}>Permissions</legend>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                                    gap: 4,
                                }}
                            >
                                {AVAILABLE_PERMISSIONS.map((permission) => {
                                    const checked = role.permissions.includes(permission);
                                    return (
                                        <Checkbox
                                            key={`${role.position}-${permission}`}
                                            label={permission}
                                            checked={checked}
                                            onChange={(event) => {
                                                const next = event.target.checked
                                                    ? [...role.permissions, permission]
                                                    : role.permissions.filter(
                                                          (item) => item !== permission
                                                      );
                                                void updateRole(role.position, {
                                                    permissions: next,
                                                });
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </fieldset>
                    </article>
                ))}
            </div>
        </section>
    );
};

export default RoleEditor;
