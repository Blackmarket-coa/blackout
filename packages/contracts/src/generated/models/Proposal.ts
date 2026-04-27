/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DomainEvent } from './DomainEvent';
import type { ProposalOption } from './ProposalOption';
export type Proposal = {
    id: string;
    communityId: string;
    proposerId: string;
    title: string;
    description?: string;
    voteType: string;
    options: Array<ProposalOption>;
    requiresQuorum: number;
    durationHours: number;
    status: string;
    event?: DomainEvent;
};

