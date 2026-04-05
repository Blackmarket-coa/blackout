/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $LinkCommunitiesRequest = {
    properties: {
        sourceCommunityId: {
            type: 'string',
            isRequired: true,
        },
        targetCommunityId: {
            type: 'string',
            isRequired: true,
        },
        linkType: {
            type: 'string',
        },
        matrixBridgeRoomId: {
            type: 'string',
        },
    },
} as const;
