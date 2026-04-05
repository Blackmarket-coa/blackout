/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $Vote = {
    properties: {
        id: {
            type: 'string',
            isRequired: true,
        },
        communityId: {
            type: 'string',
            isRequired: true,
        },
        proposerId: {
            type: 'string',
            isRequired: true,
        },
        title: {
            type: 'string',
            isRequired: true,
        },
        description: {
            type: 'string',
        },
        voteType: {
            type: 'string',
            isRequired: true,
        },
        options: {
            type: 'array',
            contains: {
                type: 'VoteOption',
            },
            isRequired: true,
        },
        requiresQuorum: {
            type: 'number',
            isRequired: true,
        },
        durationHours: {
            type: 'number',
            isRequired: true,
        },
        status: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
