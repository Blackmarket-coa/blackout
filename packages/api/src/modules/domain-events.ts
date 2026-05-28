export interface DomainEvent<TPayload = unknown> {
  id: string;
  module:
    | 'governance'
    | 'forum'
    | 'deaddrop'
    | 'deadman'
    | 'moderation'
    | 'streaming'
    | 'monetization'
    | 'profile'
    | 'stego';
  type: string;
  payload: TPayload;
  emittedAt: string;
}

const MAX_EVENTS = 10_000;
const events: DomainEvent[] = [];

export function emitDomainEvent<TPayload>(event: Omit<DomainEvent<TPayload>, 'id' | 'emittedAt'>): DomainEvent<TPayload> {
  const emitted: DomainEvent<TPayload> = {
    id: crypto.randomUUID(),
    emittedAt: new Date().toISOString(),
    ...event,
  };

  events.push(emitted);
  while (events.length > MAX_EVENTS) events.shift();
  return emitted;
}

export function listDomainEvents(moduleId?: DomainEvent['module']): DomainEvent[] {
  if (!moduleId) {
    return [...events];
  }

  return events.filter((event) => event.module === moduleId);
}
