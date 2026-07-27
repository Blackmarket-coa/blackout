import type { CoalitionTask, TaskStatus } from '@blackout/core';
import { db } from '../db/store';

export function listTasks(filter: { denId?: string } = {}): CoalitionTask[] {
    return db.listCoalitionTasks(filter);
}

export interface CreateTaskInput {
    id: string;
    denId: string;
    title: string;
    description?: string;
    assigneeId?: string;
    createdBy?: string;
    proposalEventId?: string;
}

export function createTask(input: CreateTaskInput): CoalitionTask {
    return db.createCoalitionTask(input);
}

export function getTask(id: string): CoalitionTask | null {
    return db.getCoalitionTask(id) ?? null;
}

export function updateTaskStatus(id: string, status: TaskStatus): CoalitionTask | null {
    return db.updateCoalitionTaskStatus(id, status) ?? null;
}

export function newTaskId(): string {
    return `task_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}
