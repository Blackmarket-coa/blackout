/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $GetVoteResponse = {
    type: 'all-of',
    contains: [{
        type: 'Vote',
    }, {
        properties: {
            results: {
                type: 'dictionary',
                contains: {
                    type: 'number',
                },
                isRequired: true,
            },
        },
    }],
} as const;
