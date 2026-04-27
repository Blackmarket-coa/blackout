/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProposalOptionInput } from './ProposalOptionInput';
export type CreateProposalRequest = {
    communityId: string;
    proposerId: string;
    title: string;
    description?: string;
    options?: Array<ProposalOptionInput>;
    durationHours?: number;
};

