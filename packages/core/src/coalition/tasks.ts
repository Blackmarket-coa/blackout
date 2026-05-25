/**
 * Lightweight task board for Coalition dens. Tasks are intentionally simple —
 * a title moving across three columns — and may optionally reference a
 * governance proposal so organizing work can hang off a decision.
 */

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface CoalitionTask {
    id: string;
    denId: string;
    title: string;
    description?: string;
    status: TaskStatus;
    assigneeId?: string;
    /** Optional link to a governance proposal state-event id. */
    proposalEventId?: string;
    createdAt: string;
    updatedAt: string;
}

export function isTaskStatus(value: unknown): value is TaskStatus {
    return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value);
}

/** Group tasks into the three board columns, preserving input order per column. */
export function groupTasksByStatus(
    tasks: readonly CoalitionTask[]
): Record<TaskStatus, CoalitionTask[]> {
    const columns: Record<TaskStatus, CoalitionTask[]> = { todo: [], doing: [], done: [] };
    for (const task of tasks) {
        columns[task.status].push(task);
    }
    return columns;
}
