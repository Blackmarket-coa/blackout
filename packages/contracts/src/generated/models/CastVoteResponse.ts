/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DomainEvent } from './DomainEvent';
export type CastVoteResponse = {
    success: boolean;
    tally: Record<string, number>;
    event?: DomainEvent;
};

