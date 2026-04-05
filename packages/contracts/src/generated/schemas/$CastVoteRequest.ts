/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CastVoteRequest = {
    properties: {
        userId: {
            type: 'string',
            isRequired: true,
        },
        choice: {
            type: 'string',
            isRequired: true,
        },
        weight: {
            type: 'number',
        },
    },
} as const;
