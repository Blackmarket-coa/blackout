export function getPushGatewayUrl(): string | undefined {
    return (import.meta as { env?: Record<string, string | undefined> }).env
        ?.VITE_BLACKOUT_PUSH_GATEWAY_URL;
}
