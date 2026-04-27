/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $DomainEvent = {
    properties: {
        id: {
            type: 'string',
            isRequired: true,
        },
        module: {
            type: 'string',
            isRequired: true,
        },
        type: {
            type: 'string',
            isRequired: true,
        },
        payload: {
            type: 'dictionary',
            contains: {
                properties: {
                },
            },
            isRequired: true,
        },
        occurredAt: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
