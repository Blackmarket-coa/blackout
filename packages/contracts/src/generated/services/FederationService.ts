/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FederatedCommunitiesResponse } from '../models/FederatedCommunitiesResponse';
import type { FederationLink } from '../models/FederationLink';
import type { LinkCommunitiesRequest } from '../models/LinkCommunitiesRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class FederationService {
    /**
     * @param requestBody
     * @returns FederationLink Link created
     * @throws ApiError
     */
    public static linkCommunities(
        requestBody: LinkCommunitiesRequest,
    ): CancelablePromise<FederationLink> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/federation/links',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Error`,
            },
        });
    }
    /**
     * @param ids
     * @returns FederatedCommunitiesResponse Communities
     * @throws ApiError
     */
    public static getFederatedCommunities(
        ids?: string,
    ): CancelablePromise<FederatedCommunitiesResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/federation/communities',
            query: {
                'ids': ids,
            },
        });
    }
}
