/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateProposalRequest = {
    properties: {
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
        options: {
            type: 'array',
            contains: {
                type: 'ProposalOptionInput',
            },
        },
        durationHours: {
            type: 'number',
        },
    },
} as const;
