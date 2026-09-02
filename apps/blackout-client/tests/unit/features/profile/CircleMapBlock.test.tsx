// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchCircleMap = vi.fn();
vi.mock('../../../../src/app/features/profile/profileClient', () => ({
    fetchCircleMap: (...args: unknown[]) => fetchCircleMap(...args),
}));

const { default: CircleMapBlock } = await import(
    '../../../../src/app/features/profile/CircleMapBlock'
);

const mount = async (ui: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(ui);
        await Promise.resolve();
        await Promise.resolve();
    });
    return container;
};

beforeEach(() => {
    document.body.innerHTML = '';
    fetchCircleMap.mockReset();
});

describe('CircleMapBlock', () => {
    it('shows a viewer only the connections the owner opted in to', async () => {
        // The server already filters for a non-owner; the block renders what it
        // is given without toggles.
        fetchCircleMap.mockResolvedValue({
            connections: [{ userId: '@shown:s', visible: true }],
            eligibleCount: 3,
            visibleCount: 1,
        });

        const container = await mount(<CircleMapBlock userId="@owner:s" isOwner={false} />);
        expect(container.textContent).toContain('shown');
        expect(container.querySelector('[data-testid^="circle-map-toggle-"]')).toBeNull();
    });

    it('lets the owner see un-opted-in overlaps so there is something to opt in from', async () => {
        fetchCircleMap.mockResolvedValue({
            connections: [
                { userId: '@shown:s', visible: true },
                { userId: '@hidden:s', visible: false },
            ],
            eligibleCount: 2,
            visibleCount: 1,
        });

        const container = await mount(
            <CircleMapBlock userId="@owner:s" isOwner visibleUserIds={['@shown:s']} />
        );
        expect(
            container.querySelector('[data-testid="circle-map-toggle-@hidden:s"]')
        ).not.toBeNull();
        expect(
            container.querySelector('[data-testid="circle-map-toggle-@shown:s"]')
        ).toHaveProperty('ariaPressed', 'true');
    });

    it('toggling a connection adds and removes it from the opt-in list', async () => {
        fetchCircleMap.mockResolvedValue({
            connections: [
                { userId: '@a:s', visible: true },
                { userId: '@b:s', visible: false },
            ],
            eligibleCount: 2,
            visibleCount: 1,
        });
        const onChangeVisible = vi.fn();

        const container = await mount(
            <CircleMapBlock
                userId="@owner:s"
                isOwner
                visibleUserIds={['@a:s']}
                onChangeVisible={onChangeVisible}
            />
        );

        await act(async () => {
            container
                .querySelector('[data-testid="circle-map-toggle-@b:s"]')
                ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(onChangeVisible).toHaveBeenCalledWith(['@a:s', '@b:s']);

        await act(async () => {
            container
                .querySelector('[data-testid="circle-map-toggle-@a:s"]')
                ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(onChangeVisible).toHaveBeenLastCalledWith([]);
    });

    it('explains the empty state to an owner with no overlapping circles yet', async () => {
        fetchCircleMap.mockResolvedValue({
            connections: [],
            eligibleCount: 0,
            visibleCount: 0,
        });
        const container = await mount(<CircleMapBlock userId="@owner:s" isOwner />);
        expect(container.textContent).toContain('both follow each other');
    });
});
