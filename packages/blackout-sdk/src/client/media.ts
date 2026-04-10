import { BlackoutSdkError } from '../errors/sdkError';

export const fetchBlob = async (url: string, fetchFn: typeof fetch = fetch): Promise<Blob> => {
    const response = await fetchFn(url);
    if (!response.ok) {
        throw new BlackoutSdkError('MEDIA_FETCH_FAILED', `Unable to fetch media (${response.status}).`);
    }

    return response.blob();
};
