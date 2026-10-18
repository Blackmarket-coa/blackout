import {
    ICreateRoomOpts,
    ICreateRoomStateEvent,
    JoinRule,
    MatrixClient,
    Preset,
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

/**
 * The `/createRoom` preset for a kind. A request that names no preset gets
 * `private_chat`: Synapse derives it from `visibility`, which defaults to
 * `private` (`handlers/room.py`, `_room_preset_config`). Under
 * `encryption_enabled_by_default_for_room_type: invite`, which both in-repo
 * homeserver templates set, the server then appends `m.room.encryption` to
 * every `private_chat` room after the client's `initial_state`, whatever that
 * state said. A Public room therefore has to name `public_chat`, or the
 * homeserver encrypts it behind the client's back and the chooser's "not
 * end-to-end encrypted" is false. Private and Restricted rooms name
 * `private_chat`, which is what they always got. The join rule the client puts
 * in `initial_state` wins over the preset's either way. `public_chat` also
 * means no guest access and the default invite power level (50) rather than
 * `private_chat`'s 0, the standard shape of a room anyone can join.
 */
export const createRoomPreset = (kind: CreateRoomKind): Preset =>
    kind === CreateRoomKind.Public ? Preset.PublicChat : Preset.PrivateChat;

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
        preset: createRoomPreset(data.kind),
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
