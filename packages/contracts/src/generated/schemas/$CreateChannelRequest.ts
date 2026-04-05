/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateChannelRequest = {
    properties: {
        communityId: {
            type: 'string',
            isRequired: true,
        },
        name: {
            type: 'string',
            isRequired: true,
        },
        description: {
            type: 'string',
        },
        channelType: {
            type: 'string',
        },
        isPrivate: {
            type: 'boolean',
        },
        matrixRoomId: {
            type: 'string',
        },
    },
} as const;
