// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiCall = vi.fn();
vi.mock('../../../../src/app/sdk/client', () => ({
    createAuthorizedApiClient:
        () =>
        (...a: unknown[]) =>
            apiCall(...a),
}));
vi.mock('../../../../src/app/features/monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'test-token',
}));

const { default: OpenVoiceRooms } = await import(
    '../../../../src/app/features/circle-feed/OpenVoiceRooms'
);

const room = (channelId: string, participantCount: number) => ({
    roomId: `room-${channelId}`,
    canopyId: 'canopy-1',
    channelId,
    participantCount,
    startedAt: '2026-09-01T00:00:00.000Z',
});

const mount = async (ui: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        ReactDOM.createRoot(container).render(ui);
        await Promise.resolve();
        await Promise.resolve();
    });
    return container;
};

beforeEach(() => {
    document.body.innerHTML = '';
    apiCall.mockReset();
});

describe('OpenVoiceRooms', () => {
    it('renders nothing at all when no room is open', async () => {
        apiCall.mockResolvedValue({ rooms: [] });
        const container = await mount(<OpenVoiceRooms />);
        // An empty shelf would make the place look abandoned, which is the
        // opposite of what a drop-in space needs.
        expect(container.querySelector('[data-testid="open-voice-rooms"]')).toBeNull();
    });

    it('renders nothing when the request fails, rather than an error box', async () => {
        apiCall.mockRejectedValue(new Error('offline'));
        const container = await mount(<OpenVoiceRooms />);
        expect(container.querySelector('[data-testid="open-voice-rooms"]')).toBeNull();
    });

    it('lists open rooms in the order the server gave them', async () => {
        apiCall.mockResolvedValue({ rooms: [room('busy', 4), room('quiet', 1)] });
        const container = await mount(<OpenVoiceRooms />);

        const rows = Array.from(container.querySelectorAll('[data-testid="open-voice-room"]'));
        expect(rows).toHaveLength(2);
        // Busiest first — the empty room is the hardest to walk into.
        expect(rows[0]?.textContent).toContain('busy');
        expect(rows[1]?.textContent).toContain('quiet');
    });

    it('counts people, singular and plural', async () => {
        apiCall.mockResolvedValue({ rooms: [room('a', 1), room('b', 3)] });
        const container = await mount(<OpenVoiceRooms />);
        const rows = Array.from(container.querySelectorAll('[data-testid="open-voice-room"]'));
        expect(rows[0]?.textContent).toContain('1 person');
        expect(rows[1]?.textContent).toContain('3 people');
    });

    it('asks the open-rooms endpoint', async () => {
        apiCall.mockResolvedValue({ rooms: [] });
        await mount(<OpenVoiceRooms />);
        expect(apiCall).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'GET', path: '/v1/voice/rooms/open' })
        );
    });
});
