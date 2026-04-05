/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { VoteOption } from './VoteOption';
export type Vote = {
    id: string;
    communityId: string;
    proposerId: string;
    title: string;
    description?: string;
    voteType: string;
    options: Array<VoteOption>;
    requiresQuorum: number;
    durationHours: number;
    status: string;
};

