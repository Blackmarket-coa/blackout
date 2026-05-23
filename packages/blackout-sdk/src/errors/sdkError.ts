export type ErrorKind = 'retryable' | 'fatal';

export class BlackoutSdkError extends Error {
    readonly code: string;
    readonly kind: ErrorKind;
    /** HTTP status when the error originated from a non-2xx response. */
    readonly status?: number;

    constructor(code: string, message: string, kind: ErrorKind = 'fatal', status?: number) {
        super(message);
        this.name = 'BlackoutSdkError';
        this.code = code;
        this.kind = kind;
        this.status = status;
    }
}
