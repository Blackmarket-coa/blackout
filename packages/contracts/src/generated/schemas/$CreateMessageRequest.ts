/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateMessageRequest = {
    properties: {
        content: {
            type: 'string',
            isRequired: true,
        },
        stegoTier: {
            type: 'number',
        },
        sign: {
            type: 'boolean',
        },
        userId: {
            type: 'string',
            isRequired: true,
        },
        matrixRoomId: {
            type: 'string',
        },
        governance: {
            type: 'GovernanceMetadata',
        },
    },
} as const;
