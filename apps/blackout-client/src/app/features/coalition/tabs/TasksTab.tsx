import React, { useCallback, useMemo, useState, type CSSProperties } from 'react';
import {
    TASK_STATUSES,
    groupTasksByStatus,
    type CoalitionTask,
    type TaskStatus,
} from '@blackout/core';
import { useCoalitionTasks, type CoalitionScopeQuery } from '../hooks/useCoalitionFeed';
import { createCoalitionTask, updateCoalitionTaskStatus } from '../coalitionClient';

export interface TasksTabProps {
    scope: CoalitionScopeQuery;
}

const COLUMN_LABEL: Record<TaskStatus, string> = {
    todo: 'To do',
    doing: 'In progress',
    done: 'Done',
};

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    height: '100%',
    minHeight: 0,
};

const boardStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    minHeight: 0,
};

const columnStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 10,
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
};

const moveButtonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 12,
    padding: '2px 8px',
};

function TaskCard({
    task,
    onMove,
}: {
    task: CoalitionTask;
    onMove: (task: CoalitionTask, direction: -1 | 1) => void;
}) {
    const index = TASK_STATUSES.indexOf(task.status);
    return (
        <article style={cardStyle} data-testid="coalition-task-card" data-task-id={task.id}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{task.title}</span>
            {task.assigneeId ? (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {task.assigneeId}
                </span>
            ) : null}
            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <button
                    type="button"
                    style={moveButtonStyle}
                    disabled={index <= 0}
                    onClick={() => onMove(task, -1)}
                    aria-label="Move task back"
                >
                    ‹
                </button>
                <button
                    type="button"
                    style={moveButtonStyle}
                    disabled={index >= TASK_STATUSES.length - 1}
                    onClick={() => onMove(task, 1)}
                    aria-label="Move task forward"
                >
                    ›
                </button>
            </div>
        </article>
    );
}

export function TasksTab({ scope }: TasksTabProps) {
    const { data, loading, error, refetch } = useCoalitionTasks(scope);
    const [title, setTitle] = useState('');
    const [pending, setPending] = useState(false);

    const columns = useMemo(() => groupTasksByStatus(data?.tasks ?? []), [data]);

    const onMove = useCallback(
        async (task: CoalitionTask, direction: -1 | 1) => {
            const index = TASK_STATUSES.indexOf(task.status);
            const next = TASK_STATUSES[index + direction];
            if (!next) return;
            await updateCoalitionTaskStatus(task.id, next);
            refetch();
        },
        [refetch],
    );

    const onAdd = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const trimmed = title.trim();
            if (!trimmed || !scope.denId || pending) return;
            setPending(true);
            try {
                await createCoalitionTask({ denId: scope.denId, title: trimmed });
                setTitle('');
                refetch();
            } finally {
                setPending(false);
            }
        },
        [title, scope.denId, pending, refetch],
    );

    if (!scope.denId) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                Open a den to see its task board.
            </div>
        );
    }

    return (
        <div style={containerStyle} data-testid="coalition-tasks">
            <form onSubmit={onAdd} style={{ display: 'flex', gap: 8 }} data-testid="coalition-task-composer">
                <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Add a task…"
                    data-testid="coalition-task-input"
                    style={{
                        flex: 1,
                        padding: 8,
                        borderRadius: 8,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                    }}
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
                    Add
                </button>
            </form>

            {error ? (
                <div style={{ color: 'var(--danger)', fontSize: 13 }}>Couldn't load tasks: {error}</div>
            ) : null}
            {loading && !data ? <div style={{ color: 'var(--text-secondary)' }}>Loading…</div> : null}

            <div style={boardStyle}>
                {TASK_STATUSES.map((status) => (
                    <section key={status} style={columnStyle} data-task-column={status}>
                        <header
                            style={{
                                fontSize: 12,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            {COLUMN_LABEL[status]} ({columns[status].length})
                        </header>
                        {columns[status].map((task) => (
                            <TaskCard key={task.id} task={task} onMove={onMove} />
                        ))}
                    </section>
                ))}
            </div>
        </div>
    );
}

export default TasksTab;
