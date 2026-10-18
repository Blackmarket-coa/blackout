import {
    ICreateRoomOpts,
    ICreateRoomStateEvent,
    JoinRule,
    MatrixClient,
    RestrictedAllowType,
    Room,
} from 'matrix-js-sdk';
import { RoomJoinRulesEventContent } from 'matrix-js-sdk/lib/types';
import { CreateRoomKind } from './kind';
import { RoomType, StateEvent } from '../../../types/matrix/room';
import { getViaServers } from '../../plugins/via-servers';
import { getMxIdServer } from '../../utils/matrix';
import { createRoomEncryptionState } from '../../utils/matrix-crypto';

export const createRoomCreationContent = (
    type: RoomType | undefined,
    allowFederation: boolean,
    additionalCreators: string[] | undefined
): object => {
    const content: Record<string, any> = {};
    if (typeof type === 'string') {
        content.type = type;
    }
    if (allowFederation === false) {
        content['m.federate'] = false;
    }
    if (Array.isArray(additionalCreators)) {
        content.additional_creators = additionalCreators;
    }

    return content;
};

/**
 * The `m.room.join_rules` initial-state event for a kind. `Restricted` names
 * every room in `allowRoomIds` (membership in any one of them admits), and
 * falls back to invite when there is nothing to restrict to.
 */
export const createJoinRulesState = (
    kind: CreateRoomKind,
    allowRoomIds: readonly string[],
    knock: boolean
) => {
    let content: RoomJoinRulesEventContent = {
        join_rule: knock ? JoinRule.Knock : JoinRule.Invite,
    };

    if (kind === CreateRoomKind.Public) {
        content = {
            join_rule: JoinRule.Public,
        };
    }

    if (kind === CreateRoomKind.Restricted && allowRoomIds.length > 0) {
        content = {
            join_rule: knock ? ('knock_restricted' as JoinRule) : JoinRule.Restricted,
            allow: allowRoomIds.map((roomId) => ({
                type: RestrictedAllowType.RoomMembership,
                room_id: roomId,
            })),
        };
    }

    return {
        type: StateEvent.RoomJoinRules,
        state_key: '',
        content,
    };
};

export const createRoomJoinRulesState = (
    kind: CreateRoomKind,
    parent: Pick<Room, 'roomId'> | undefined,
    knock: boolean
) => createJoinRulesState(kind, parent ? [parent.roomId] : [], knock);

export const createRoomParentState = (parent: Room) => ({
    type: StateEvent.SpaceParent,
    state_key: parent.roomId,
    content: {
        canonical: true,
        via: getViaServers(parent),
    },
});

const createSpacePowerLevelsOverride = () => ({
    events_default: 50,
});

export { createRoomEncryptionState } from '../../utils/matrix-crypto';

export type CreateRoomData = {
    version: string;
    type?: RoomType;
    parent?: Room;
    kind: CreateRoomKind;
    name: string;
    topic?: string;
    aliasLocalPart?: string;
    encryption?: boolean;
    knock: boolean;
    allowFederation: boolean;
    additionalCreators?: string[];
};
export const createRoom = async (mx: MatrixClient, data: CreateRoomData): Promise<string> => {
    const initialState: ICreateRoomStateEvent[] = [];

    if (data.encryption) {
        initialState.push(createRoomEncryptionState());
    }

    if (data.parent) {
        initialState.push(createRoomParentState(data.parent));
    }

    initialState.push(createRoomJoinRulesState(data.kind, data.parent, data.knock));

    const options: ICreateRoomOpts = {
        room_version: data.version,
        name: data.name,
        topic: data.topic,
        room_alias_name: data.aliasLocalPart,
        creation_content: createRoomCreationContent(
            data.type,
            data.allowFederation,
            data.additionalCreators
        ),
        initial_state: initialState,
    };

    if (data.type === RoomType.Space) {
        options.power_level_content_override = createSpacePowerLevelsOverride();
    }

    const result = await mx.createRoom(options);

    if (data.parent) {
        await mx.sendStateEvent(
            data.parent.roomId,
            StateEvent.SpaceChild as any,
            {
                auto_join: false,
                suggested: false,
                via: [getMxIdServer(mx.getUserId() ?? '') ?? ''],
            },
            result.room_id
        );
    }

    return result.room_id;
};
