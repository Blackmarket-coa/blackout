import { createClient, type MatrixClient } from 'matrix-js-sdk';

export interface MatrixClientConfig {
    baseUrl: string;
    userId?: string;
    accessToken?: string;
    deviceId?: string;
}

export const createMatrixClient = (config: MatrixClientConfig): MatrixClient => {
    return createClient({
        baseUrl: config.baseUrl,
        userId: config.userId,
        accessToken: config.accessToken,
        deviceId: config.deviceId,
    });
};
