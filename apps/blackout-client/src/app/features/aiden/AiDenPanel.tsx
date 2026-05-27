import React, { useCallback, useState, type CSSProperties } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { aiToolsEnabled, type DenType } from '@blackout/core';
import { echoAiProvider, type AiProvider, type AiProviderMessage } from './aiProvider';
import {
    equippedAiPersonaAtom,
    equippedAiPersonaIdAtom,
    ownedAiPersonasAtom,
    ownedAutomationRecipesAtom,
} from './aiGoodsAtoms';

export interface AiDenPanelProps {
    /** The den (room) this panel is scoped to. */
    roomId: string | null;
    /** Resolved den classification — the panel self-gates on this. */
    denType: DenType;
    /** Injectable for tests / future real models. Defaults to the echo seam. */
    provider?: AiProvider;
}

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    height: '100%',
    minHeight: 0,
};

const noticeStyle: CSSProperties = {
    padding: 16,
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
    color: 'var(--text-secondary)',
};

const logStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const bubbleStyle = (role: AiProviderMessage['role']): CSSProperties => ({
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    maxWidth: '80%',
    padding: '8px 12px',
    borderRadius: 12,
    background: role === 'user' ? 'var(--accent-primary, #1ABC9C)' : 'var(--bg-input)',
    color: role === 'user' ? '#fff' : 'var(--text-primary)',
    fontSize: 14,
    lineHeight: 1.4,
});

export function AiDenPanel({ roomId, denType, provider = echoAiProvider }: AiDenPanelProps) {
    const [messages, setMessages] = useState<AiProviderMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [pending, setPending] = useState(false);
    const ownedPersonas = useAtomValue(ownedAiPersonasAtom);
    const ownedAutomations = useAtomValue(ownedAutomationRecipesAtom);
    const equippedPersona = useAtomValue(equippedAiPersonaAtom);
    const [equippedPersonaId, setEquippedPersonaId] = useAtom(equippedAiPersonaIdAtom);

    const onSubmit = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const trimmed = draft.trim();
            if (!trimmed || pending) return;
            const next: AiProviderMessage[] = [...messages, { role: 'user', content: trimmed }];
            setMessages(next);
            setDraft('');
            setPending(true);
            try {
                // Prepend the equipped persona's system prompt for this request
                // without persisting it as a visible bubble.
                const request: AiProviderMessage[] = equippedPersona
                    ? [{ role: 'system', content: equippedPersona.systemPrompt }, ...next]
                    : next;
                const reply = await provider.complete(request);
                setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
            } finally {
                setPending(false);
            }
        },
        [draft, equippedPersona, messages, pending, provider],
    );

    // AI tooling is confined to AI dens. This is defense-in-depth: the tab is
    // only surfaced for AI dens, but the gate lives here too.
    if (!aiToolsEnabled(denType)) {
        return (
            <div style={containerStyle} data-testid="ai-den-panel">
                <div style={noticeStyle} data-testid="ai-den-gated">
                    AI tools are available only inside AI dens. This keeps reasoning,
                    evidence, and participation human everywhere else.
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle} data-testid="ai-den-panel">
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                }}
            >
                <span>Model: {provider.label}</span>
                {ownedPersonas.length > 0 ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        Persona
                        <select
                            data-testid="ai-den-persona"
                            value={equippedPersonaId ?? ''}
                            onChange={(event) =>
                                setEquippedPersonaId(event.target.value || null)
                            }
                            style={{
                                padding: '2px 6px',
                                borderRadius: 6,
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            <option value="">None</option>
                            {ownedPersonas.map((persona) => (
                                <option key={persona.id} value={persona.id}>
                                    {persona.name}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}
            </div>
            {ownedAutomations.length > 0 ? (
                <details data-testid="ai-den-automations" style={{ fontSize: 12 }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        Automations ({ownedAutomations.length})
                    </summary>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                        {ownedAutomations.map((recipe) => (
                            <li key={recipe.id} data-automation={recipe.id}>
                                <strong>{recipe.name}</strong>
                                {recipe.triggers.length > 0
                                    ? ` — when ${recipe.triggers.join(', ')}`
                                    : ''}
                                {recipe.actions.length > 0
                                    ? ` → ${recipe.actions.join(', ')}`
                                    : ''}
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
            <div style={logStyle} data-testid="ai-den-log">
                {messages.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                        {equippedPersona?.greeting ??
                            'Ask the AI den for research, analysis, summarization, or brainstorming.'}
                    </p>
                ) : (
                    messages.map((message, index) => (
                        <div key={index} style={bubbleStyle(message.role)}>
                            {message.content}
                        </div>
                    ))
                )}
            </div>
            <form
                onSubmit={onSubmit}
                data-testid="ai-den-composer"
                style={{ display: 'flex', gap: 8 }}
            >
                <input
                    data-testid="ai-den-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={roomId ? 'Message the AI den…' : 'Select a den first'}
                    disabled={!roomId || pending}
                    style={{
                        flex: 1,
                        padding: 8,
                        borderRadius: 8,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                    }}
                />
                <button
                    type="submit"
                    data-testid="ai-den-send"
                    disabled={!roomId || pending || draft.trim().length === 0}
                    style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--accent-primary, #1ABC9C)',
                        background: 'var(--accent-primary, #1ABC9C)',
                        color: '#fff',
                        cursor: pending ? 'progress' : 'pointer',
                    }}
                >
                    {pending ? 'Thinking…' : 'Send'}
                </button>
            </form>
        </div>
    );
}

export default AiDenPanel;
