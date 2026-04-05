/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Channel } from '../models/Channel';
import type { CreateChannelRequest } from '../models/CreateChannelRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ChannelsService {
    /**
     * @returns Channel Channels
     * @throws ApiError
     */
    public static listChannels(): CancelablePromise<Array<Channel>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/channels',
        });
    }
    /**
     * @param requestBody
     * @returns Channel Created
     * @throws ApiError
     */
    public static createChannel(
        requestBody: CreateChannelRequest,
    ): CancelablePromise<Channel> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/channels',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
