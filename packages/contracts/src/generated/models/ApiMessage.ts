/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { GovernanceMetadata } from './GovernanceMetadata';
export type ApiMessage = {
    id: string;
    channelId: string;
    userId: string;
    username?: string;
    content: string;
    contentStegoTier: number;
    createdAt: string;
    governance?: GovernanceMetadata;
};

