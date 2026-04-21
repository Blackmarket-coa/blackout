export type ErrorKind = 'retryable' | 'fatal';

export class BlackoutSdkError extends Error {
    readonly code: string;
    readonly kind: ErrorKind;

    constructor(code: string, message: string, kind: ErrorKind = 'fatal') {
        super(message);
        this.name = 'BlackoutSdkError';
        this.code = code;
        this.kind = kind;
    }
}
