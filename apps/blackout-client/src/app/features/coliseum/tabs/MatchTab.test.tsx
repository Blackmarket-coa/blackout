// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const fetchColiseumMatch = vi.fn();
vi.mock('../coliseumMatchClient', () => ({
    fetchColiseumMatch: (...a: unknown[]) => fetchColiseumMatch(...a),
    acceptColiseumMatch: vi.fn(),
    castColiseumRoundVote: vi.fn(),
    castColiseumSynthesisVote: vi.fn(),
    mintColiseumVerdict: vi.fn(),
    openColiseumCrucible: vi.fn(),
}));

// Seed the selected-match atom before the module (atomWithStorage) initializes.
window.localStorage.setItem('bmc-coliseum-match', JSON.stringify('m1'));

import { MatchTab } from './MatchTab';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const render = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(node);
        await flush();
    });
    return container;
};

describe('MatchTab', () => {
    beforeEach(() => fetchColiseumMatch.mockReset());

    it('renders fighter cards and the Brief, and hides tallies when withheld', async () => {
        fetchColiseumMatch.mockResolvedValue({
            match: {
                id: 'm1',
                type: 'callout',
                proposition: 'Remote work is dead.',
                challengerId: '@red:s',
                opponentId: '@blue:s',
                status: 'verdict',
                createdAt: '2026-01-01T00:00:00Z',
                roundWindowMs: 1000,
                open: false,
            },
            rounds: [
                {
                    id: 'r1',
                    matchId: 'm1',
                    index: 0,
                    side: 'red',
                    authorId: '@red:s',
                    kind: 'opening',
                    body: 'Opening blow',
                    citations: [],
                    createdAt: '2026-01-01T00:01:00Z',
                },
            ],
            tallies: undefined,
            challengeStatus: 'accepted',
            brief: {
                id: 'b1',
                matchId: 'm1',
                proposition: 'Remote work is dead.',
                claims: [],
                upheldFlags: [],
                shiftScore: 0.42,
                winner: 'red',
                questionBreakdown: [
                    {
                        questionId: 'decisive',
                        prompt: 'Who landed the decisive blow?',
                        red: 3,
                        blue: 0,
                        neither: 0,
                        both: 0,
                        winner: 'red',
                    },
                ],
                mintedAt: '2026-01-01T00:30:00Z',
            },
        });

        const container = await render(React.createElement(MatchTab));
        expect(fetchColiseumMatch).toHaveBeenCalledWith('m1');
        expect(container.textContent).toContain('Remote work is dead.');
        expect(container.querySelector('[data-testid="coliseum-brief"]')).not.toBeNull();
        expect(container.textContent).toContain('Tallies hidden');
        expect(container.querySelector('[data-testid="coliseum-round"]')).not.toBeNull();
    });
});
