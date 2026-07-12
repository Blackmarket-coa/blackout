// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, expect, it, vi } from 'vitest';

const useCallMock = vi.fn();
vi.mock('../../../../src/app/features/call/CallProvider', () => ({
    useCall: () => useCallMock(),
}));

import { ScreenSharePreview } from '../../../../src/app/features/call/ScreenSharePreview';

const renderPreview = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<ScreenSharePreview />);
        await Promise.resolve();
    });
    return { container, root };
};

const fakeStream = { getTracks: () => [] } as unknown as MediaStream;

describe('ScreenSharePreview', () => {
    it('renders nothing when no share is active', async () => {
        useCallMock.mockReturnValue({
            screenSharing: false,
            displayStream: null,
            setScreenSharing: vi.fn(),
        });
        const { container, root } = await renderPreview();
        expect(container.querySelector('[data-testid="screen-share-preview"]')).toBeNull();
        root.unmount();
    });

    it('renders nothing while sharing is requested but capture has not landed', async () => {
        useCallMock.mockReturnValue({
            screenSharing: true,
            displayStream: null,
            setScreenSharing: vi.fn(),
        });
        const { container, root } = await renderPreview();
        expect(container.querySelector('[data-testid="screen-share-preview"]')).toBeNull();
        root.unmount();
    });

    it('binds the display stream to a muted preview video and stops on demand', async () => {
        const setScreenSharing = vi.fn();
        useCallMock.mockReturnValue({
            screenSharing: true,
            displayStream: fakeStream,
            setScreenSharing,
        });
        const { container, root } = await renderPreview();

        const tile = container.querySelector('[data-testid="screen-share-preview"]');
        expect(tile).toBeTruthy();
        const video = container.querySelector('video') as HTMLVideoElement;
        expect(video).toBeTruthy();
        expect(video.muted).toBe(true);
        expect(video.srcObject).toBe(fakeStream);
        expect(tile?.textContent).toContain('You are sharing your screen');

        const stop = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent === 'Stop'
        );
        expect(stop).toBeTruthy();
        await act(async () => {
            stop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(setScreenSharing).toHaveBeenCalledWith(false);

        root.unmount();
    });
});
