export {
    useLegacyRoomAdapter as useRoom,
    useLegacyRoomNameAdapter as useRoomName,
    useLegacyRoomAvatarAdapter as useRoomAvatar,
    useLegacyRoomTopicAdapter as useRoomTopic,
    useLegacyRoomMembersAdapter as useRoomMembers,
    useLegacyRoomRefreshAdapter as useRoomRefresh,
    type HookResult,
} from '../../../plugins/matrix-adapters/hooks/useLegacyRoomAdapter';
export {
    useLegacyRoomTimelineAdapter as useRoomTimeline,
    useLegacyTimelineScrollAdapter as useTimelineScroll,
    useLegacySendMessageAdapter as useSendMessage,
    useLegacyEditMessageAdapter as useEditMessage,
    useLegacyReactionAdapter as useReaction,
    type TimelineResult,
} from '../../../plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';
