/**
 * Provider seam for AI Den tooling. The platform ships no real model yet — the
 * choice of provider, privacy posture, and cost model is a deliberate later
 * decision. Wiring a real model means implementing this interface once; every
 * AI Den surface consumes the abstraction, never a concrete SDK.
 */

export interface AiProviderMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface AiProvider {
    readonly id: string;
    readonly label: string;
    complete(messages: readonly AiProviderMessage[]): Promise<string>;
}

/** Default no-op provider: echoes the last user message. */
export const echoAiProvider: AiProvider = {
    id: 'echo',
    label: 'Echo (no model connected)',
    async complete(messages) {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        const system = messages.find((m) => m.role === 'system');
        const prefix = system ? '[persona] ' : '';
        return lastUser
            ? `${prefix}Echo: ${lastUser.content}`
            : 'No model is connected to this AI den yet.';
    },
};
