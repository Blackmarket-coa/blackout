/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CastVoteRequest } from '../models/CastVoteRequest';
import type { CastVoteResponse } from '../models/CastVoteResponse';
import type { CreateVoteRequest } from '../models/CreateVoteRequest';
import type { GetVoteResponse } from '../models/GetVoteResponse';
import type { Vote } from '../models/Vote';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class GovernanceService {
    /**
     * @param requestBody
     * @returns Vote Vote created
     * @throws ApiError
     */
    public static createVote(
        requestBody: CreateVoteRequest,
    ): CancelablePromise<Vote> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/governance/votes',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Error`,
            },
        });
    }
    /**
     * @param voteId
     * @returns GetVoteResponse Vote
     * @throws ApiError
     */
    public static getVote(
        voteId: string,
    ): CancelablePromise<GetVoteResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/governance/votes/{voteId}',
            path: {
                'voteId': voteId,
            },
            errors: {
                404: `Error`,
            },
        });
    }
    /**
     * @param voteId
     * @param requestBody
     * @returns CastVoteResponse Vote cast
     * @throws ApiError
     */
    public static castVote(
        voteId: string,
        requestBody: CastVoteRequest,
    ): CancelablePromise<CastVoteResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/governance/votes/{voteId}/cast',
            path: {
                'voteId': voteId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Error`,
                404: `Error`,
            },
        });
    }
}
