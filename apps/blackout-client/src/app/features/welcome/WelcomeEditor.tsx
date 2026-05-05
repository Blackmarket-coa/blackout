import React, { useEffect, useMemo, useState } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useLegacyRoomAdapter as useRoom } from '../../plugins/matrix-adapters/hooks/useLegacyRoomAdapter';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { OnboardingWizard } from './OnboardingWizard';
import { WelcomeScreen } from './WelcomeScreen';
import {
    type FeaturedChannel,
    type OnboardingStep,
    type OnboardingStepType,
    useOnboardingContent,
    useSetOnboardingContent,
    useSetWelcomeContent,
    useWelcomeContent,
} from './useWelcome';

const emptyChannel: FeaturedChannel = {
    roomId: '',
    emoji: '💬',
    description: '',
};

const emptyStep = (type: OnboardingStepType): OnboardingStep => ({
    type,
    title: '',
    content: '',
    description: '',
    requireAccept: false,
    roles: [],
    channels: [],
});

export const WelcomeEditor = ({ spaceId }: { spaceId: string }) => {
    const client = useMatrixClient();
    const welcome = useWelcomeContent(spaceId);
    const onboarding = useOnboardingContent(spaceId);
    const setWelcome = useSetWelcomeContent(spaceId);
    const setOnboarding = useSetOnboardingContent(spaceId);
    const spaceRoom = useRoom(spaceId);

    const [draft, setDraft] = useState(welcome.data);
    const [onboardingDraft, setOnboardingDraft] = useState(onboarding.data);
    const [preview, setPreview] = useState(false);

    useEffect(() => {
        setDraft(welcome.data);
    }, [welcome.data]);

    useEffect(() => {
        setOnboardingDraft(onboarding.data);
    }, [onboarding.data]);

    const memberRoomOptions = useMemo(() => {
        if (!spaceRoom.data) return [];
        const children = spaceRoom.data.currentState.getStateEvents('m.space.child') ?? [];
        return children
            .map((event) => ({ roomId: event.getStateKey(), label: event.getStateKey() }))
            .filter((item): item is { roomId: string; label: string } => Boolean(item.roomId));
    }, [spaceRoom.data]);

    const uploadBanner = async (file: File): Promise<string | undefined> => {
        const uploadResult = (await client.uploadContent(file, {
            includeFilename: true,
            type: file.type,
        })) as string | { content_uri?: string };
        if (typeof uploadResult === 'string') return uploadResult;
        return uploadResult.content_uri;
    };

    const addFeaturedChannel = () =>
        setDraft((prev) => ({
            ...prev,
            featuredChannels: [...prev.featuredChannels, { ...emptyChannel }],
        }));

    const addStep = (type: OnboardingStepType) => {
        setOnboardingDraft((prev) => ({
            ...prev,
            steps: [...prev.steps, emptyStep(type)],
        }));
    };

    const saveAll = async () => {
        await setWelcome(draft);
        await setOnboarding(onboardingDraft);
    };

    if (preview) {
        return (
            <section style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{BLACKOUT_TERMS.canopy.title} welcome preview</strong>
                    <button
                        type="button"
                        onClick={() => setPreview(false)}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: '4px 8px',
                        }}
                    >
                        Back to editor
                    </button>
                </div>

                <WelcomeScreen
                    spaceId={spaceId}
                    actionLabel={`Explore ${BLACKOUT_TERMS.den.plural}`}
                />
                <OnboardingWizard
                    spaceId={spaceId}
                    open={onboardingDraft.enabled}
                    onClose={() => undefined}
                />
            </section>
        );
    }

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    alignItems: 'center',
                }}
            >
                <strong>{BLACKOUT_TERMS.canopy.title} welcome and onboarding editor</strong>
                <div style={{ display: 'inline-flex', gap: 8 }}>
                    <button
                        type="button"
                        onClick={() => setPreview(true)}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: '6px 10px',
                        }}
                    >
                        Preview
                    </button>
                    <button
                        type="button"
                        onClick={() => void saveAll()}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--accent-primary)',
                            color: 'var(--bg-surface)',
                            padding: '6px 10px',
                        }}
                    >
                        Save
                    </button>
                </div>
            </header>

            <section
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    background: 'var(--bg-surface)',
                    padding: 12,
                    display: 'grid',
                    gap: 10,
                }}
            >
                <h3 style={{ margin: 0 }}>Welcome content</h3>

                <label style={{ display: 'grid', gap: 4 }}>
                    Title
                    <input
                        value={draft.title}
                        onChange={(event) =>
                            setDraft((prev) => ({ ...prev, title: event.target.value }))
                        }
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: '6px 8px',
                        }}
                    />
                </label>

                <label style={{ display: 'grid', gap: 4 }}>
                    Description (Markdown)
                    <textarea
                        value={draft.description}
                        rows={5}
                        onChange={(event) =>
                            setDraft((prev) => ({ ...prev, description: event.target.value }))
                        }
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: 8,
                        }}
                    />
                </label>

                <label style={{ display: 'grid', gap: 4 }}>
                    Banner image
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            if (!file) return;
                            void uploadBanner(file).then((mxcUri) => {
                                if (!mxcUri) return;
                                setDraft((prev) => ({ ...prev, bannerMxcUrl: mxcUri }));
                            });
                        }}
                    />
                </label>

                <div style={{ display: 'grid', gap: 8 }}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <strong>Featured {BLACKOUT_TERMS.den.plural}</strong>
                        <button
                            type="button"
                            onClick={addFeaturedChannel}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                padding: '4px 8px',
                            }}
                        >
                            Add {BLACKOUT_TERMS.den.singular}
                        </button>
                    </div>

                    {draft.featuredChannels.map((channel, index) => (
                        <article
                            key={`${channel.roomId}-${index}`}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 10,
                                background: 'var(--bg-input)',
                                padding: 8,
                                display: 'grid',
                                gap: 6,
                            }}
                        >
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '100px 1fr',
                                    gap: 8,
                                }}
                            >
                                <input
                                    value={channel.emoji}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setDraft((prev) => {
                                            const next = [...prev.featuredChannels];
                                            next[index] = { ...next[index], emoji: value };
                                            return { ...prev, featuredChannels: next };
                                        });
                                    }}
                                    placeholder="Emoji"
                                    style={{
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 8,
                                        background: 'var(--bg-surface)',
                                        color: 'var(--text-primary)',
                                        padding: '6px 8px',
                                    }}
                                />
                                <input
                                    value={channel.description}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setDraft((prev) => {
                                            const next = [...prev.featuredChannels];
                                            next[index] = { ...next[index], description: value };
                                            return { ...prev, featuredChannels: next };
                                        });
                                    }}
                                    placeholder="Description"
                                    style={{
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 8,
                                        background: 'var(--bg-surface)',
                                        color: 'var(--text-primary)',
                                        padding: '6px 8px',
                                    }}
                                />
                            </div>

                            <select
                                value={channel.roomId}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setDraft((prev) => {
                                        const next = [...prev.featuredChannels];
                                        next[index] = { ...next[index], roomId: value };
                                        return { ...prev, featuredChannels: next };
                                    });
                                }}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 8,
                                    background: 'var(--bg-surface)',
                                    color: 'var(--text-primary)',
                                    padding: '6px 8px',
                                }}
                            >
                                <option value="">Choose {BLACKOUT_TERMS.den.singular}</option>
                                {memberRoomOptions.map((option) => (
                                    <option key={option.roomId} value={option.roomId}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </article>
                    ))}
                </div>
            </section>

            <section
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    background: 'var(--bg-surface)',
                    padding: 12,
                    display: 'grid',
                    gap: 10,
                }}
            >
                <h3 style={{ margin: 0 }}>Onboarding flow</h3>

                <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <input
                        type="checkbox"
                        checked={onboardingDraft.enabled}
                        onChange={(event) =>
                            setOnboardingDraft((prev) => ({
                                ...prev,
                                enabled: event.target.checked,
                            }))
                        }
                    />
                    Enable onboarding wizard
                </label>

                <div style={{ display: 'inline-flex', gap: 8 }}>
                    <button
                        type="button"
                        onClick={() => addStep('rules')}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: '4px 8px',
                        }}
                    >
                        Add Rules
                    </button>
                    <button
                        type="button"
                        onClick={() => addStep('roles')}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: '4px 8px',
                        }}
                    >
                        Add Roles
                    </button>
                    <button
                        type="button"
                        onClick={() => addStep('channels')}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: '4px 8px',
                        }}
                    >
                        Add {BLACKOUT_TERMS.den.titlePlural}
                    </button>
                </div>

                {onboardingDraft.steps.map((step, index) => (
                    <article
                        key={`${step.type}-${index}`}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 10,
                            background: 'var(--bg-input)',
                            padding: 8,
                            display: 'grid',
                            gap: 6,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <strong>{step.type.toUpperCase()}</strong>
                            <button
                                type="button"
                                onClick={() => {
                                    setOnboardingDraft((prev) => ({
                                        ...prev,
                                        steps: prev.steps.filter((_, idx) => idx !== index),
                                    }));
                                }}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 8,
                                    background: 'var(--danger)',
                                    color: '#fff',
                                    padding: '3px 8px',
                                }}
                            >
                                Delete
                            </button>
                        </div>

                        <input
                            value={step.title}
                            onChange={(event) => {
                                const value = event.target.value;
                                setOnboardingDraft((prev) => {
                                    const steps = [...prev.steps];
                                    steps[index] = { ...steps[index], title: value };
                                    return { ...prev, steps };
                                });
                            }}
                            placeholder="Step title"
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                background: 'var(--bg-surface)',
                                color: 'var(--text-primary)',
                                padding: '6px 8px',
                            }}
                        />

                        {step.type === 'rules' ? (
                            <>
                                <textarea
                                    value={step.content || ''}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setOnboardingDraft((prev) => {
                                            const steps = [...prev.steps];
                                            steps[index] = { ...steps[index], content: value };
                                            return { ...prev, steps };
                                        });
                                    }}
                                    rows={4}
                                    placeholder="Rules text"
                                    style={{
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 8,
                                        background: 'var(--bg-surface)',
                                        color: 'var(--text-primary)',
                                        padding: 8,
                                    }}
                                />
                                <label style={{ display: 'inline-flex', gap: 6 }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(step.requireAccept)}
                                        onChange={(event) => {
                                            const checked = event.target.checked;
                                            setOnboardingDraft((prev) => {
                                                const steps = [...prev.steps];
                                                steps[index] = {
                                                    ...steps[index],
                                                    requireAccept: checked,
                                                };
                                                return { ...prev, steps };
                                            });
                                        }}
                                    />
                                    Require acceptance
                                </label>
                            </>
                        ) : null}

                        {step.type === 'roles' ? (
                            <textarea
                                value={(step.roles ?? []).join(', ')}
                                onChange={(event) => {
                                    const roles = event.target.value
                                        .split(',')
                                        .map((item) => item.trim())
                                        .filter(Boolean);
                                    setOnboardingDraft((prev) => {
                                        const steps = [...prev.steps];
                                        steps[index] = { ...steps[index], roles };
                                        return { ...prev, steps };
                                    });
                                }}
                                rows={2}
                                placeholder="Role names, comma-separated"
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 8,
                                    background: 'var(--bg-surface)',
                                    color: 'var(--text-primary)',
                                    padding: 8,
                                }}
                            />
                        ) : null}

                        {step.type === 'channels' ? (
                            <textarea
                                value={(step.channels ?? []).join(', ')}
                                onChange={(event) => {
                                    const channels = event.target.value
                                        .split(',')
                                        .map((item) => item.trim())
                                        .filter(Boolean);
                                    setOnboardingDraft((prev) => {
                                        const steps = [...prev.steps];
                                        steps[index] = { ...steps[index], channels };
                                        return { ...prev, steps };
                                    });
                                }}
                                rows={2}
                                placeholder="Den IDs, comma-separated"
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 8,
                                    background: 'var(--bg-surface)',
                                    color: 'var(--text-primary)',
                                    padding: 8,
                                }}
                            />
                        ) : null}
                    </article>
                ))}
            </section>
        </section>
    );
};

export default WelcomeEditor;
