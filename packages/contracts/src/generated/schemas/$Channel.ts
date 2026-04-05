/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $Channel = {
    properties: {
        id: {
            type: 'string',
            isRequired: true,
        },
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
            isRequired: true,
        },
        isPrivate: {
            type: 'boolean',
            isRequired: true,
        },
        matrixRoomId: {
            type: 'string',
        },
    },
} as const;
