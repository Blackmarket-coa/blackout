import { useEffect, useMemo, useState } from 'react';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../../hooks/useMatrixClient';

export interface DraupnirClientConfig {
    managementRoomId?: string;
    managementRoomAlias?: string;
}

export interface DraupnirModAction {
    action: string;
    moderator: string;
    target?: string;
    reason?: string;
    timestamp: number;
    eventId: string;
}

export type DraupnirBanEntity = 'user' | 'server' | 'pattern' | 'unknown';

export interface DraupnirBanEntry {
    entityType: DraupnirBanEntity;
    value: string;
    reason?: string;
    sourceRoomId?: string;
    timestamp: number;
    by?: string;
    eventId: string;
}

export interface DraupnirProtectionState {
    key: string;
    enabled: boolean;
    sourceEventId: string;
    updatedAt: number;
}

export interface DraupnirPromptState {
    promptId: string;
    promptText: string;
    options: string[];
    timestamp: number;
}

export interface DraupnirSnapshot {
    roomId: string;
    roomName: string;
    actions: DraupnirModAction[];
    banEntries: DraupnirBanEntry[];
    protections: DraupnirProtectionState[];
    policyListRooms: string[];
    prompts: DraupnirPromptState[];
    raidActive: boolean;
}

const COMMAND_PREFIX = '!draupnir';
const CONFIG_EVENT = 'co.bmc.draupnir';

const toString = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined;
const toBoolean = (value: unknown): boolean | undefined =>
    typeof value === 'boolean' ? value : undefined;

const parseTextJson = (body: string): Record<string, unknown> | null => {
    try {
        const parsed = JSON.parse(body) as unknown;
        if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
        return null;
    } catch {
        return null;
    }
};

const inferEntityType = (value: string): DraupnirBanEntity => {
    if (value.startsWith('@')) return 'user';
    if (value.startsWith('*.') || value.includes('*')) return 'pattern';
    if (value.includes('.')) return 'server';
    return 'unknown';
};

const fromTimelineEvent = (
    event: MatrixEvent,
): { content: Record<string, unknown>; timestamp: number } => {
    const content = event.getContent<Record<string, unknown>>();
    const body = toString(content.body);
    const jsonBody = body ? parseTextJson(body) : null;

    return {
        content: jsonBody ?? content,
        timestamp: event.getTs(),
    };
};

const parseAction = (event: MatrixEvent): DraupnirModAction | null => {
    const { content, timestamp } = fromTimelineEvent(event);
    const action =
        toString(content.action) ?? toString(content.outcome) ?? toString(content.recommendation);
    if (!action) return null;

    const moderator = event.getSender() ?? toString(content.moderator) ?? 'unknown';
    const target =
        toString(content.target) ?? toString(content.user_id) ?? toString(content.entity);
    const reason = toString(content.reason) ?? toString(content.description);

    return {
        action,
        moderator,
        target,
        reason,
        timestamp,
        eventId: event.getId() ?? `${timestamp}-${moderator}`,
    };
};

const parseBanEntry = (event: MatrixEvent): DraupnirBanEntry | null => {
    const { content, timestamp } = fromTimelineEvent(event);
    const candidate =
        toString(content.entity) ??
        toString(content.target) ??
        toString(content.user_id) ??
        toString(content.server) ??
        toString(content.pattern);

    const banHint = toString(content.action) ?? toString(content.kind) ?? '';
    const isBan = /ban|watchlist|policy/i.test(banHint) || event.getType().includes('policy');
    if (!candidate || !isBan) return null;

    return {
        entityType:
            (toString(content.entity_type) as DraupnirBanEntity | undefined) ??
            inferEntityType(candidate),
        value: candidate,
        reason: toString(content.reason) ?? toString(content.description),
        sourceRoomId: toString(content.policy_room) ?? toString(content.room_id),
        timestamp,
        by: event.getSender() ?? undefined,
        eventId: event.getId() ?? `${timestamp}-${candidate}`,
    };
};

const parseProtection = (event: MatrixEvent): DraupnirProtectionState | null => {
    const { content, timestamp } = fromTimelineEvent(event);
    const key = toString(content.protection) ?? toString(content.name) ?? toString(content.guard);
    const enabled =
        toBoolean(content.enabled) ?? /enabled|active/i.test(toString(content.status) ?? '');

    if (!key || enabled === undefined) return null;

    return {
        key,
        enabled,
        sourceEventId: event.getId() ?? `${timestamp}-${key}`,
        updatedAt: timestamp,
    };
};

const parsePrompt = (event: MatrixEvent): DraupnirPromptState | null => {
    const content = event.getContent<Record<string, unknown>>();
    const body = toString(content.body) ?? '';

    const promptId = toString(content.prompt_id) ?? toString(content.session_id);
    const options = Array.isArray(content.options)
        ? content.options.filter((entry): entry is string => typeof entry === 'string')
        : [];

    if (promptId && options.length > 0) {
        return {
            promptId,
            promptText: toString(content.prompt) ?? body,
            options,
            timestamp: event.getTs(),
        };
    }

    if (body.toLowerCase().includes('select ban list') || body.toLowerCase().includes('choose')) {
        const extracted = body
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => /^[0-9]+[.)]/.test(line))
            .map((line) => line.replace(/^[0-9]+[.)]\s*/, ''));

        return {
            promptId: event.getId() ?? String(event.getTs()),
            promptText: body,
            options: extracted,
            timestamp: event.getTs(),
        };
    }

    return null;
};

export class DraupnirClient {
    public constructor(
        private readonly matrixClient: MatrixClient,
        private readonly config?: DraupnirClientConfig,
    ) {}

    public async findManagementRoom(): Promise<Room | null> {
        if (this.config?.managementRoomId) {
            return this.matrixClient.getRoom(this.config.managementRoomId) ?? null;
        }

        const roomFromConfig = this.readConfigEventRoom();
        if (roomFromConfig) return roomFromConfig;

        if (this.config?.managementRoomAlias) {
            const byAlias = this.matrixClient
                .getRooms()
                .find((room) => room.getCanonicalAlias() === this.config?.managementRoomAlias);
            if (byAlias) return byAlias;
        }

        return (
            this.matrixClient.getRooms().find((room) => {
                const alias = room.getCanonicalAlias() ?? '';
                const name = room.name.toLowerCase();
                return (
                    alias.includes('draupnir') ||
                    name.includes('draupnir') ||
                    name.includes('moderation management')
                );
            }) ?? null
        );
    }

    public parseSnapshot(room: Room): DraupnirSnapshot {
        const events = room.getLiveTimeline().getEvents();

        const actions = events
            .map(parseAction)
            .filter((item): item is DraupnirModAction => item !== null)
            .sort((a, b) => b.timestamp - a.timestamp);

        const banEntries = events
            .map(parseBanEntry)
            .filter((item): item is DraupnirBanEntry => item !== null)
            .sort((a, b) => b.timestamp - a.timestamp);

        const protectionsByKey = new Map<string, DraupnirProtectionState>();
        events.forEach((event) => {
            const status = parseProtection(event);
            if (!status) return;

            const previous = protectionsByKey.get(status.key);
            if (!previous || previous.updatedAt < status.updatedAt) {
                protectionsByKey.set(status.key, status);
            }
        });

        const prompts = events
            .map(parsePrompt)
            .filter((item): item is DraupnirPromptState => item !== null)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 3);

        const policyListRooms = [
            ...new Set(
                banEntries
                    .map((entry) => entry.sourceRoomId)
                    .filter((entry): entry is string => Boolean(entry)),
            ),
        ];

        const raidActive = events.some((event) => {
            const { content } = fromTimelineEvent(event);
            const status = toString(content.raid_status) ?? toString(content.status) ?? '';
            return /raid.*active|active.*raid|lockdown/i.test(status);
        });

        return {
            roomId: room.roomId,
            roomName: room.name,
            actions,
            banEntries,
            protections: [...protectionsByKey.values()].sort((a, b) => a.key.localeCompare(b.key)),
            policyListRooms,
            prompts,
            raidActive,
        };
    }

    public async sendCommand(roomId: string, command: string, args: string[] = []): Promise<void> {
        const message = `${COMMAND_PREFIX} ${command} ${args.join(' ')}`.trim();
        await this.matrixClient.sendEvent(
            roomId,
            'm.room.message' as never,
            {
                msgtype: 'm.text',
                body: message,
            } as never,
        );
    }

    public async sendPromptResponse(roomId: string, response: string): Promise<void> {
        await this.matrixClient.sendEvent(
            roomId,
            'm.room.message' as never,
            {
                msgtype: 'm.text',
                body: response,
            } as never,
        );
    }

    private readConfigEventRoom(): Room | null {
        const config = this.matrixClient.getAccountData(CONFIG_EVENT as never)?.getContent() as
            | { managementRoomId?: string; managementRoomAlias?: string }
            | undefined;

        if (config?.managementRoomId) {
            return this.matrixClient.getRoom(config.managementRoomId) ?? null;
        }

        if (config?.managementRoomAlias) {
            return (
                this.matrixClient
                    .getRooms()
                    .find((room) => room.getCanonicalAlias() === config.managementRoomAlias) ?? null
            );
        }

        return null;
    }
}

export const useDraupnirClient = (config?: DraupnirClientConfig): DraupnirClient => {
    const matrixClient = useMatrixClient();
    return useMemo(() => new DraupnirClient(matrixClient, config), [config, matrixClient]);
};

export const useDraupnirManagementRoom = (config?: DraupnirClientConfig) => {
    const draupnir = useDraupnirClient(config);
    const matrixClient = useMatrixClient();
    const [room, setRoom] = useState<Room | null>(null);

    useEffect(() => {
        let mounted = true;

        const resolve = async () => {
            const next = await draupnir.findManagementRoom();
            if (!mounted) return;
            setRoom(next);
        };

        void resolve();

        const onTimeline = (event: MatrixEvent, timelineRoom: Room) => {
            if (!room || timelineRoom.roomId !== room.roomId) return;
            setRoom(matrixClient.getRoom(timelineRoom.roomId) ?? null);
        };

        const emitter = matrixClient as unknown as {
            on: (event: string, callback: (...args: unknown[]) => void) => void;
            off: (event: string, callback: (...args: unknown[]) => void) => void;
        };

        emitter.on('Room.timeline', onTimeline as (...args: unknown[]) => void);

        return () => {
            mounted = false;
            emitter.off('Room.timeline', onTimeline as (...args: unknown[]) => void);
        };
    }, [draupnir, matrixClient, room]);

    return room;
};

export const useDraupnirSnapshot = (config?: DraupnirClientConfig) => {
    const room = useDraupnirManagementRoom(config);
    const draupnir = useDraupnirClient(config);

    return useMemo(() => {
        if (!room) return null;
        return draupnir.parseSnapshot(room);
    }, [draupnir, room]);
};

export const DRAUPNIR_COMMAND_PREFIX = COMMAND_PREFIX;
