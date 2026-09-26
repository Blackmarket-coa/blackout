// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { useOverflowFade } from './useOverflowFade';

const Row = () => {
    const ref = useOverflowFade<HTMLDivElement>();
    return (
        <div ref={ref} data-testid="row">
            <button type="button">One</button>
            <button type="button">Two</button>
        </div>
    );
};

const mounted: ReactDOM.Root[] = [];

// jsdom has no layout, so stub the geometry the hook reads before mounting.
const stubGeometry = (scrollWidth: number, clientWidth: number) => {
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        get: () => scrollWidth,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get: () => clientWidth,
    });
};

const render = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mounted.push(root);
    await act(async () => {
        root.render(<Row />);
    });
    return container.querySelector('[data-testid="row"]') as HTMLDivElement;
};

afterEach(() => {
    mounted.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = '';
    delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('useOverflowFade', () => {
    it('fades only the trailing edge when content overflows at the start', async () => {
        stubGeometry(600, 300);
        const row = await render();
        expect(row.dataset.overflowStart).toBe('false');
        expect(row.dataset.overflowEnd).toBe('true');
    });

    it('fades both edges mid-scroll and only the leading edge at the end', async () => {
        stubGeometry(600, 300);
        const row = await render();
        await act(async () => {
            row.scrollLeft = 150;
            row.dispatchEvent(new Event('scroll'));
        });
        expect(row.dataset.overflowStart).toBe('true');
        expect(row.dataset.overflowEnd).toBe('true');
        await act(async () => {
            row.scrollLeft = 300;
            row.dispatchEvent(new Event('scroll'));
        });
        expect(row.dataset.overflowStart).toBe('true');
        expect(row.dataset.overflowEnd).toBe('false');
    });

    it('applies no mask when everything fits', async () => {
        stubGeometry(300, 300);
        const row = await render();
        expect(row.dataset.overflowStart).toBe('false');
        expect(row.dataset.overflowEnd).toBe('false');
        expect(row.style.maskImage ?? '').toBe('');
    });
});
