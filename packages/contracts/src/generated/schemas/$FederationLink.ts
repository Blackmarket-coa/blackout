/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $FederationLink = {
    properties: {
        id: {
            type: 'string',
            isRequired: true,
        },
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
            isRequired: true,
        },
        matrixBridgeRoomId: {
            type: 'string',
            isRequired: true,
        },
        isActive: {
            type: 'boolean',
            isRequired: true,
        },
    },
} as const;
