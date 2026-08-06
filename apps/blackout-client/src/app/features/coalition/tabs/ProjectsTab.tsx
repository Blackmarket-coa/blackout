import React, { useCallback, useState, type CSSProperties } from 'react';
import {
    PROJECT_STATUSES,
    SUGGESTED_PROJECT_CATEGORIES,
    type CoalitionPlace,
    type ProjectStatus,
} from '@blackout/core';
import { useCoalitionProjects, type CoalitionScopeQuery } from '../hooks/useCoalitionFeed';
import {
    createCoalitionProject,
    updateCoalitionProject,
    updateCoalitionProjectStatus,
} from '../coalitionClient';
import { PlacePicker } from '../map/PlacePicker';
import { PlaceEditor } from '../map/PlaceEditor';

export interface ProjectsTabProps {
    scope: CoalitionScopeQuery;
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
    proposed: 'Proposed',
    active: 'Active',
    paused: 'Paused',
    complete: 'Complete',
};

const CATEGORY_LABEL: Record<string, string> = {
    community_garden: 'Community garden',
    tool_library: 'Tool library',
    food: 'Food project',
    open_source: 'Open source',
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

export function ProjectsTab({ scope }: ProjectsTabProps) {
    const { data, loading, error, refetch } = useCoalitionProjects(scope);
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState<string>(SUGGESTED_PROJECT_CATEGORIES[0]);
    const [place, setPlace] = useState<CoalitionPlace | null>(null);
    const [pending, setPending] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const onAdd = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const trimmed = title.trim();
            if (!trimmed || !scope.canopyId || pending) return;
            setPending(true);
            setSubmitError(null);
            try {
                await createCoalitionProject({
                    canopyId: scope.canopyId,
                    title: trimmed,
                    category,
                    place: place ?? undefined,
                });
                setTitle('');
                setPlace(null);
                refetch();
            } catch (err: unknown) {
                // A rejected request used to be an unhandled rejection: the
                // button re-enabled and nothing else happened, so a mistyped
                // coordinate looked like the form was simply broken.
                setSubmitError(
                    err instanceof Error ? err.message : 'Could not launch that project.'
                );
            } finally {
                setPending(false);
            }
        },
        [title, category, place, scope.canopyId, pending, refetch]
    );

    // Card mutations report where they failed. Without this a 403 from the
    // lead-only rule was an unhandled rejection: the select snapped back on the
    // next render with nothing said.
    const [cardError, setCardError] = useState<{ id: string; message: string } | null>(null);

    const onStatus = useCallback(
        async (id: string, status: ProjectStatus) => {
            setCardError(null);
            try {
                await updateCoalitionProjectStatus(id, status);
                refetch();
            } catch (err: unknown) {
                setCardError({
                    id,
                    message: err instanceof Error ? err.message : 'Could not update that project.',
                });
            }
        },
        [refetch]
    );

    const onPlace = useCallback(
        async (id: string, next: CoalitionPlace | null) => {
            await updateCoalitionProject(id, { place: next });
            refetch();
        },
        [refetch]
    );

    if (!scope.canopyId) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                Open a coalition to see its projects.
            </div>
        );
    }

    const projects = data?.projects ?? [];

    return (
        <div style={containerStyle} data-testid="coalition-projects">
            <form
                onSubmit={onAdd}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                data-testid="coalition-project-composer"
            >
                <div style={{ display: 'flex', gap: 8 }}>
                    <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        style={selectStyle}
                        aria-label="Project category"
                    >
                        {SUGGESTED_PROJECT_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                                {CATEGORY_LABEL[c] ?? c}
                            </option>
                        ))}
                    </select>
                    <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Launch a project…"
                        data-testid="coalition-project-input"
                        style={inputStyle}
                    />
                    <button
                        type="submit"
                        disabled={pending || title.trim().length === 0}
                        style={{
                            padding: '8px 14px',
                            borderRadius: 8,
                            border: '1px solid var(--accent-primary, #1ABC9C)',
                            background: 'var(--accent-primary, #1ABC9C)',
                            color: '#fff',
                            cursor: pending ? 'progress' : 'pointer',
                        }}
                    >
                        Launch
                    </button>
                </div>
                {/*
                 * A community garden is an address; a mutual-aid route or an
                 * open-source build is an area, or nowhere. All three are valid.
                 */}
                <PlacePicker
                    value={place}
                    onChange={setPlace}
                    label="Where?"
                    testId="coalition-project-place"
                />
                {submitError ? (
                    <span
                        style={{ fontSize: 12, color: 'var(--danger, #E74C3C)' }}
                        role="alert"
                        data-testid="coalition-project-submit-error"
                    >
                        {submitError}
                    </span>
                ) : null}
            </form>

            {error ? (
                <div style={{ color: 'var(--danger)', fontSize: 13 }}>
                    Couldn't load projects: {error}
                </div>
            ) : null}
            {loading && !data ? (
                <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>
            ) : null}
            {!loading && projects.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    No projects yet. Launch your coalition's first initiative.
                </div>
            ) : null}

            {projects.map((project) => (
                <article
                    key={project.id}
                    style={cardStyle}
                    data-testid="coalition-project-card"
                    data-project-id={project.id}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={badgeStyle}>
                            {CATEGORY_LABEL[project.category] ?? project.category}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
                            {project.title}
                        </span>
                        <span style={badgeStyle}>{STATUS_LABEL[project.status]}</span>
                    </div>
                    <PlaceEditor
                        place={project.place}
                        onSave={(next) => onPlace(project.id, next)}
                        testId="coalition-project-place-line"
                    />
                    {project.description ? (
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                            {project.description}
                        </p>
                    ) : null}
                    <select
                        value={project.status}
                        onChange={(event) =>
                            onStatus(project.id, event.target.value as ProjectStatus)
                        }
                        style={{ ...selectStyle, alignSelf: 'flex-start' }}
                        aria-label="Update project status"
                    >
                        {PROJECT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                                {STATUS_LABEL[status]}
                            </option>
                        ))}
                    </select>
                    {cardError?.id === project.id ? (
                        <span
                            style={{ fontSize: 12, color: 'var(--danger, #E74C3C)' }}
                            role="alert"
                            data-testid="coalition-project-card-error"
                        >
                            {cardError.message}
                        </span>
                    ) : null}
                </article>
            ))}
        </div>
    );
}

export default ProjectsTab;
