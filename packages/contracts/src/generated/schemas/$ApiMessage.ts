/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $ApiMessage = {
    properties: {
        id: {
            type: 'string',
            isRequired: true,
        },
        channelId: {
            type: 'string',
            isRequired: true,
        },
        userId: {
            type: 'string',
            isRequired: true,
        },
        username: {
            type: 'string',
        },
        content: {
            type: 'string',
            isRequired: true,
        },
        contentStegoTier: {
            type: 'number',
            isRequired: true,
        },
        createdAt: {
            type: 'string',
            isRequired: true,
        },
        governance: {
            type: 'GovernanceMetadata',
        },
    },
} as const;
