import type { RetryPolicy } from './types';

const delay = async (ms: number): Promise<void> => {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
};

const shouldRetryStatus = (status: number, retryOnStatuses?: number[]): boolean => {
    if (Array.isArray(retryOnStatuses) && retryOnStatuses.length > 0) {
        return retryOnStatuses.includes(status);
    }

    return status === 429 || status >= 500;
};

export const isRetryableStatus = shouldRetryStatus;

export type FetchWithRetryResult = {
    response: Response;
    attempts: number;
    retryable: boolean;
};

export const fetchWithRetry = async (
    operation: () => Promise<Response>,
    retry?: RetryPolicy,
): Promise<FetchWithRetryResult> => {
    const attempts = Math.max(1, retry?.attempts ?? 1);
    const backoffMs = retry?.backoffMs ?? 0;

    let lastResponse: Response | undefined;
    let lastRetryable = false;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const response = await operation();
        if (response.ok) {
            return { response, attempts: attempt, retryable: false };
        }

        lastResponse = response;
        lastRetryable = shouldRetryStatus(response.status, retry?.retryOnStatuses);

        if (lastRetryable && attempt < attempts) {
            await delay(backoffMs * attempt);
            continue;
        }

        return { response, attempts: attempt, retryable: lastRetryable };
    }

    return { response: lastResponse as Response, attempts, retryable: lastRetryable };
};
