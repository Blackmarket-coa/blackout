/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $GetProposalResponse = {
    type: 'all-of',
    contains: [{
        type: 'Proposal',
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
