/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $RegisterResponse = {
    properties: {
        token: {
            type: 'string',
            isRequired: true,
        },
        userId: {
            type: 'string',
            isRequired: true,
        },
        matrix: {
            type: 'dictionary',
            contains: {
                properties: {
                },
            },
            isRequired: true,
        },
    },
} as const;
