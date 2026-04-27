/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CastVoteRequest = {
    properties: {
        voteId: {
            type: 'string',
            isRequired: true,
        },
        userId: {
            type: 'string',
            isRequired: true,
        },
        choice: {
            type: 'one-of',
            contains: [{
                type: 'string',
            }, {
                type: 'array',
                contains: {
                    type: 'string',
                },
            }],
            isRequired: true,
        },
        weight: {
            type: 'number',
        },
    },
} as const;
