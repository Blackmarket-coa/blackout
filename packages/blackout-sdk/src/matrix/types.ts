export type MatrixEventClient = {
    sendEvent: (roomId: string, eventType: string, content: Record<string, unknown>) => Promise<unknown>;
    sendStateEvent: (
        roomId: string,
        eventType: string,
        content: Record<string, unknown>,
        stateKey: string
    ) => Promise<unknown>;
};

