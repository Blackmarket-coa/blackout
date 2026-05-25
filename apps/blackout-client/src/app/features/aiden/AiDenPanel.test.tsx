// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { aiToolsEnabled, resolveDenType } from '@blackout/core';
import AiDenPanel from './AiDenPanel';
import { echoAiProvider } from './aiProvider';

let container: HTMLDivElement | null = null;
let root: ReactDOM.Root | null = null;

function render(ui: React.ReactElement) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    act(() => {
        root!.render(ui);
    });
    return container;
}

beforeEach(() => {
    if (root) {
        act(() => root!.unmount());
    }
    container?.remove();
    container = null;
    root = null;
});

describe('den classification gate', () => {
    it('enables AI tools only for AI dens', () => {
        expect(aiToolsEnabled('ai')).toBe(true);
        expect(aiToolsEnabled('public')).toBe(false);
        expect(aiToolsEnabled('coalition')).toBe(false);
        expect(aiToolsEnabled('private')).toBe(false);
    });

    it('defaults unknown classification to public', () => {
        expect(resolveDenType(undefined)).toBe('public');
        expect(resolveDenType({ denType: 'bogus' as never })).toBe('public');
        expect(resolveDenType({ denType: 'ai' })).toBe('ai');
    });
});

describe('AiDenPanel', () => {
    it('renders the gated notice outside an AI den', () => {
        const el = render(<AiDenPanel roomId="!d:server" denType="public" />);
        expect(el.querySelector('[data-testid="ai-den-gated"]')).not.toBeNull();
        expect(el.querySelector('[data-testid="ai-den-composer"]')).toBeNull();
    });

    it('renders the assistant composer inside an AI den', () => {
        const el = render(<AiDenPanel roomId="!d:server" denType="ai" />);
        expect(el.querySelector('[data-testid="ai-den-gated"]')).toBeNull();
        expect(el.querySelector('[data-testid="ai-den-composer"]')).not.toBeNull();
    });
});

describe('echoAiProvider', () => {
    it('echoes the last user message', async () => {
        const reply = await echoAiProvider.complete([
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi' },
            { role: 'user', content: 'summarize this' },
        ]);
        expect(reply).toBe('Echo: summarize this');
    });
});
