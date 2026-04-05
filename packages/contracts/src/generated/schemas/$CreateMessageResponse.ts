/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateMessageResponse = {
    properties: {
        message: {
            type: 'ApiMessage',
            isRequired: true,
        },
        matrix: {
            type: 'one-of',
            contains: [{
                type: 'dictionary',
                contains: {
                    properties: {
                    },
                },
            }, {
                type: 'null',
            }],
            isNullable: true,
        },
    },
} as const;
