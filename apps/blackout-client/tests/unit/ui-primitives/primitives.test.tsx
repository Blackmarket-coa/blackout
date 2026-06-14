// @vitest-environment jsdom
//
// Unit tests + render fixtures for the @blackout/ui v1 primitives (Workstream
// B1). Hosted in the client's vitest project because that is the canonical web
// test runner (jsdom + react-dom 18 + the vanilla-extract plugin that compiles
// the primitives' `.css.ts`). Primitives are imported from source for the same
// reason the client consumes `@blackout/design` from source.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    Badge,
    Button,
    Card,
    IconButton,
    Input,
    Separator,
    Spinner,
    Stack,
} from '../../../../../packages/ui/src/primitives';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;

let container: HTMLDivElement;
let root: ReactDOM.Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

const render = (node: React.ReactElement) => {
    act(() => {
        root.render(node);
    });
};

describe('Button', () => {
    it('renders children with type=button by default and fires onClick', () => {
        const onClick = vi.fn();
        render(<Button onClick={onClick}>Send</Button>);
        const btn = container.querySelector('button');
        expect(btn?.textContent).toContain('Send');
        expect(btn?.getAttribute('type')).toBe('button');
        act(() => {
            btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('loading renders a Spinner, disables the button and sets aria-busy', () => {
        render(<Button loading>Send</Button>);
        const btn = container.querySelector('button');
        expect(btn?.disabled).toBe(true);
        expect(btn?.getAttribute('aria-busy')).toBe('true');
        expect(btn?.querySelector('[role="status"]')).not.toBeNull();
    });
});

describe('IconButton', () => {
    it('reflects toggle state through aria-pressed', () => {
        render(<IconButton active aria-label="Bold">B</IconButton>);
        expect(
            container.querySelector('button')?.getAttribute('aria-pressed'),
        ).toBe('true');
    });

    it('omits aria-pressed when not a toggle', () => {
        render(<IconButton aria-label="More">…</IconButton>);
        expect(
            container.querySelector('button')?.hasAttribute('aria-pressed'),
        ).toBe(false);
    });
});

describe('Input', () => {
    it('sets aria-invalid when invalid', () => {
        render(<Input invalid defaultValue="x" aria-label="field" />);
        expect(
            container.querySelector('input')?.getAttribute('aria-invalid'),
        ).toBe('true');
    });
});

describe('Badge', () => {
    it('renders a dismiss button that fires onDismiss', () => {
        const onDismiss = vi.fn();
        render(
            <Badge onDismiss={onDismiss} dismissLabel="Remove file.png">
                file.png
            </Badge>,
        );
        const dismiss = container.querySelector(
            'button[aria-label="Remove file.png"]',
        );
        expect(dismiss).not.toBeNull();
        act(() => {
            dismiss?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('renders no dismiss button without onDismiss', () => {
        render(<Badge>plain</Badge>);
        expect(container.querySelector('button')).toBeNull();
    });
});

describe('Spinner', () => {
    it('is an accessible status with a default label', () => {
        render(<Spinner />);
        const status = container.querySelector('[role="status"]');
        expect(status?.getAttribute('aria-label')).toBe('Loading');
    });
});

describe('Stack', () => {
    it('lays out as a flex container in the requested direction', () => {
        render(
            <Stack direction="column" gap={4}>
                <span>a</span>
                <span>b</span>
            </Stack>,
        );
        const el = container.firstElementChild as HTMLElement;
        expect(el.style.display).toBe('flex');
        expect(el.style.flexDirection).toBe('column');
        expect(el.style.gap).toBe('4px');
    });
});

describe('Separator', () => {
    it('exposes role=separator with orientation', () => {
        render(<Separator orientation="vertical" />);
        const sep = container.querySelector('[role="separator"]');
        expect(sep?.getAttribute('aria-orientation')).toBe('vertical');
    });
});

describe('Card', () => {
    it('renders its children', () => {
        render(<Card>body</Card>);
        expect(container.textContent).toContain('body');
    });
});
