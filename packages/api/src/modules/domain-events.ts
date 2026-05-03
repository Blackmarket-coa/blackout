export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  module: 'governance' | 'forum' | 'deaddrop' | 'deadman' | 'moderation' | 'streaming';
  type: string;
  payload: TPayload;
  emittedAt: string;
}

const events: DomainEvent[] = [];

export function emitDomainEvent<TPayload extends Record<string, unknown>>(event: Omit<DomainEvent<TPayload>, 'id' | 'emittedAt'>): DomainEvent<TPayload> {
  const emitted: DomainEvent<TPayload> = {
    id: crypto.randomUUID(),
    emittedAt: new Date().toISOString(),
    ...event,
  };

  events.push(emitted);
  return emitted;
}

export function listDomainEvents(moduleId?: DomainEvent['module']): DomainEvent[] {
  if (!moduleId) {
    return [...events];
  }

  return events.filter((event) => event.module === moduleId);
}
