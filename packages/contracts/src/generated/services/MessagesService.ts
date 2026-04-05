/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiMessage } from '../models/ApiMessage';
import type { CreateMessageRequest } from '../models/CreateMessageRequest';
import type { CreateMessageResponse } from '../models/CreateMessageResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class MessagesService {
    /**
     * @param channelId
     * @param limit
     * @param before
     * @returns ApiMessage Messages
     * @throws ApiError
     */
    public static listMessages(
        channelId: string,
        limit?: number,
        before?: string,
    ): CancelablePromise<Array<ApiMessage>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/messages/{channelId}',
            path: {
                'channelId': channelId,
            },
            query: {
                'limit': limit,
                'before': before,
            },
        });
    }
    /**
     * @param channelId
     * @param requestBody
     * @returns CreateMessageResponse Created
     * @throws ApiError
     */
    public static createMessage(
        channelId: string,
        requestBody: CreateMessageRequest,
    ): CancelablePromise<CreateMessageResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/messages/{channelId}',
            path: {
                'channelId': channelId,
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
