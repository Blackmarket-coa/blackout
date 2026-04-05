/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { GovernanceMetadata } from './GovernanceMetadata';
export type CreateMessageRequest = {
    content: string;
    stegoTier?: number;
    sign?: boolean;
    userId: string;
    matrixRoomId?: string;
    governance?: GovernanceMetadata;
};

