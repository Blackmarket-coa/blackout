/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CastVoteRequest } from '../models/CastVoteRequest';
import type { CastVoteResponse } from '../models/CastVoteResponse';
import type { CreateProposalRequest } from '../models/CreateProposalRequest';
import type { GetProposalResponse } from '../models/GetProposalResponse';
import type { Proposal } from '../models/Proposal';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class GovernanceService {
    /**
     * @param requestBody
     * @returns Proposal Proposal created
     * @throws ApiError
     */
    public static createProposal(
        requestBody: CreateProposalRequest,
    ): CancelablePromise<Proposal> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/governance/proposals',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Error`,
                401: `Error`,
                403: `Error`,
            },
        });
    }
    /**
     * @param proposalId
     * @returns GetProposalResponse Proposal
     * @throws ApiError
     */
    public static getProposal(
        proposalId: string,
    ): CancelablePromise<GetProposalResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/governance/proposals/{proposalId}',
            path: {
                'proposalId': proposalId,
            },
            errors: {
                401: `Error`,
                403: `Error`,
                404: `Error`,
            },
        });
    }
    /**
     * @param requestBody
     * @returns CastVoteResponse Vote cast
     * @throws ApiError
     */
    public static castVote(
        requestBody: CastVoteRequest,
    ): CancelablePromise<CastVoteResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/governance/votes',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Error`,
                401: `Error`,
                403: `Error`,
                404: `Error`,
            },
        });
    }
    /**
     * @returns any Domain events
     * @throws ApiError
     */
    public static listGovernanceEvents(): CancelablePromise<Array<Record<string, any>>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/governance/events',
            errors: {
                401: `Error`,
                403: `Error`,
            },
        });
    }
}
