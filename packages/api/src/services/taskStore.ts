import type { CoalitionTask, TaskStatus } from '@blackout/core';

const tasks = new Map<string, CoalitionTask>();

const seedNow = '2026-05-02T09:00:00Z';
const seedTasks: CoalitionTask[] = [
    {
        id: 'task_seed_1',
        denId: '!demo-aid:server',
        title: 'Confirm Saturday food pickup',
        status: 'todo',
        createdAt: seedNow,
        updatedAt: seedNow,
    },
    {
        id: 'task_seed_2',
        denId: '!demo-aid:server',
        title: 'Print and post flyers',
        status: 'doing',
        assigneeId: '@oak:server',
        createdAt: seedNow,
        updatedAt: seedNow,
    },
    {
        id: 'task_seed_3',
        denId: '!demo-aid:server',
        title: 'Book the community hall',
        status: 'done',
        createdAt: seedNow,
        updatedAt: seedNow,
    },
];
for (const task of seedTasks) tasks.set(task.id, task);

export function listTasks(filter: { denId?: string } = {}): CoalitionTask[] {
    return [...tasks.values()].filter((task) =>
        filter.denId ? task.denId === filter.denId : true,
    );
}

export interface CreateTaskInput {
    id: string;
    denId: string;
    title: string;
    description?: string;
    assigneeId?: string;
    proposalEventId?: string;
}

export function createTask(input: CreateTaskInput): CoalitionTask {
    const now = new Date().toISOString();
    const task: CoalitionTask = {
        id: input.id,
        denId: input.denId,
        title: input.title,
        description: input.description,
        assigneeId: input.assigneeId,
        proposalEventId: input.proposalEventId,
        status: 'todo',
        createdAt: now,
        updatedAt: now,
    };
    tasks.set(task.id, task);
    return task;
}

export function updateTaskStatus(id: string, status: TaskStatus): CoalitionTask | null {
    const existing = tasks.get(id);
    if (!existing) return null;
    const updated: CoalitionTask = {
        ...existing,
        status,
        updatedAt: new Date().toISOString(),
    };
    tasks.set(id, updated);
    return updated;
}

export function newTaskId(): string {
    return `task_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}
