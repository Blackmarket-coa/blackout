let inMemoryToken: string | null = null;

export function readBlackoutApiToken(): string | null {
    return inMemoryToken;
}

export function setBlackoutApiToken(token: string): void {
    inMemoryToken = token;
}

export function clearBlackoutApiToken(): void {
    inMemoryToken = null;
}
