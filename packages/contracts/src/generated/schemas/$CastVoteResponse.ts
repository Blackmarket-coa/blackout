/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CastVoteResponse = {
    properties: {
        success: {
            type: 'boolean',
            isRequired: true,
        },
        tally: {
            type: 'dictionary',
            contains: {
                type: 'number',
            },
            isRequired: true,
        },
    },
} as const;
