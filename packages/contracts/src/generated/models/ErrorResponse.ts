/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ErrorResponse = {
    /**
     * Machine-readable error code (snake_case).
     */
    code: string;
    /**
     * Human-readable error message.
     */
    message: string;
    /**
     * Optional structured error context (e.g. validation issues).
     */
    details?: Record<string, any>;
};

