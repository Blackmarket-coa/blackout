// @vitest-environment jsdom
//
// Unit tests + render fixtures for the @blackout/ui B1.1 primitives. Same
// rationale/harness as primitives.test.tsx (B1): hosted in the client vitest
// project (jsdom + react-dom 18 + vanilla-extract plugin), primitives imported
// from source. Portal layers (Modal/Sheet/Toast) render into document.body, so
// their close paths are exercised through the native Escape listener / hook API
// rather than React-synthetic clicks on portaled nodes.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    Avatar,
    Checkbox,
    Cluster,
    EmptyState,
    Grid,
    Inline,
    Menu,
    Modal,
    Popover,
    Radio,
    Select,
    Sheet,
    Switch,
    Tabs,
    TextArea,
    Toast,
    ToastProvider,
    Tooltip,
    useToast,
} from '../../../../../packages/ui/src/primitives';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const click = (el: Element | null | undefined) =>
    act(() => {
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

const pressEscape = () =>
    act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

describe('Form primitives', () => {
    it('TextArea sets aria-invalid', () => {
        render(<TextArea invalid aria-label="bio" />);
        expect(container.querySelector('textarea')?.getAttribute('aria-invalid')).toBe('true');
    });

    it('Select renders options and reflects invalid', () => {
        render(
            <Select invalid aria-label="pick">
                <option value="a">A</option>
                <option value="b">B</option>
            </Select>,
        );
        const select = container.querySelector('select');
        expect(select?.querySelectorAll('option')).toHaveLength(2);
        expect(select?.getAttribute('aria-invalid')).toBe('true');
    });

    it('Checkbox renders a label and toggles', () => {
        const onChange = vi.fn();
        render(<Checkbox label="Accept" onChange={onChange} />);
        const input = container.querySelector('input[type="checkbox"]');
        expect(container.textContent).toContain('Accept');
        click(input);
        expect(onChange).toHaveBeenCalled();
    });

    it('Radio renders a radio input with label', () => {
        render(<Radio name="g" label="Option" value="x" />);
        expect(container.querySelector('input[type="radio"]')).not.toBeNull();
        expect(container.textContent).toContain('Option');
    });

    it('Switch exposes role=switch and toggles via onCheckedChange', () => {
        const onCheckedChange = vi.fn();
        render(<Switch checked={false} onCheckedChange={onCheckedChange} aria-label="wifi" />);
        const sw = container.querySelector('[role="switch"]');
        expect(sw?.getAttribute('aria-checked')).toBe('false');
        click(sw);
        expect(onCheckedChange).toHaveBeenCalledWith(true);
    });
});

describe('Display primitives', () => {
    it('Avatar renders an image with alt when src is provided', () => {
        render(<Avatar src="https://example.test/a.png" name="Ada Lovelace" />);
        const img = container.querySelector('img');
        expect(img?.getAttribute('alt')).toBe('Ada Lovelace');
    });

    it('Avatar falls back to initials without src', () => {
        render(<Avatar name="Ada Lovelace" />);
        expect(container.querySelector('img')).toBeNull();
        expect(container.textContent).toContain('AL');
    });

    it('EmptyState renders title, description and action', () => {
        render(
            <EmptyState
                title="Nothing here"
                description="No items yet"
                action={<button type="button">Add</button>}
            />,
        );
        expect(container.textContent).toContain('Nothing here');
        expect(container.textContent).toContain('No items yet');
        expect(container.querySelector('button')?.textContent).toBe('Add');
    });
});

describe('Layout primitives', () => {
    it('Inline is a flex row', () => {
        render(<Inline><span>a</span></Inline>);
        expect((container.firstElementChild as HTMLElement).style.display).toBe('flex');
    });

    it('Cluster wraps', () => {
        render(<Cluster><span>a</span></Cluster>);
        expect((container.firstElementChild as HTMLElement).style.flexWrap).toBe('wrap');
    });

    it('Grid uses fixed columns', () => {
        render(<Grid columns={3}><span>a</span></Grid>);
        const el = container.firstElementChild as HTMLElement;
        expect(el.style.display).toBe('grid');
        expect(el.style.gridTemplateColumns).toContain('repeat(3');
    });
});

describe('Tabs', () => {
    const items = [
        { id: 'one', label: 'One', content: <p>first</p> },
        { id: 'two', label: 'Two', content: <p>second</p> },
    ];

    it('shows the active panel and switches on click', () => {
        render(<Tabs items={items} label="demo" />);
        expect(container.textContent).toContain('first');
        const tabs = [...container.querySelectorAll('[role="tab"]')];
        expect(tabs[0].getAttribute('aria-selected')).toBe('true');
        click(tabs[1]);
        expect(container.textContent).toContain('second');
        expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    });

    it('moves selection with arrow keys', () => {
        render(<Tabs items={items} label="demo" />);
        const tablist = container.querySelector('[role="tablist"]');
        act(() => {
            tablist?.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
            );
        });
        expect(container.textContent).toContain('second');
    });
});

describe('Tooltip', () => {
    it('reveals content on hover and links it via aria-describedby', () => {
        render(
            <Tooltip content="Help text">
                <button type="button">trigger</button>
            </Tooltip>,
        );
        expect(container.querySelector('[role="tooltip"]')).toBeNull();
        act(() => {
            container
                .querySelector('span')
                ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        });
        const tip = container.querySelector('[role="tooltip"]');
        expect(tip?.textContent).toBe('Help text');
        expect(container.querySelector('button')?.getAttribute('aria-describedby')).toBe(
            tip?.id,
        );
    });
});

describe('Popover', () => {
    it('opens on trigger click and closes on Escape', () => {
        render(
            <Popover trigger={<button type="button">open</button>}>
                <p>panel body</p>
            </Popover>,
        );
        expect(container.querySelector('[role="dialog"]')).toBeNull();
        click(container.querySelector('button'));
        expect(container.querySelector('[role="dialog"]')?.textContent).toContain('panel body');
        expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
        pressEscape();
        expect(container.querySelector('[role="dialog"]')).toBeNull();
    });
});

describe('Menu', () => {
    it('opens, fires onSelect and closes', () => {
        const onSelect = vi.fn();
        render(
            <Menu
                trigger={<button type="button">menu</button>}
                items={[
                    { id: 'a', label: 'Alpha', onSelect },
                    { id: 'b', label: 'Beta', onSelect: () => {} },
                ]}
            />,
        );
        click(container.querySelector('button'));
        const menu = container.querySelector('[role="menu"]');
        expect(menu).not.toBeNull();
        const first = menu?.querySelector('[role="menuitem"]');
        click(first);
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(container.querySelector('[role="menu"]')).toBeNull();
    });
});

describe('Modal', () => {
    it('renders nothing when closed', () => {
        render(<Modal open={false} onClose={() => {}}>body</Modal>);
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });

    it('portals an aria-modal dialog and closes on Escape', () => {
        const onClose = vi.fn();
        const Host = () => {
            const [open, setOpen] = React.useState(true);
            return (
                <Modal
                    open={open}
                    onClose={() => {
                        onClose();
                        setOpen(false);
                    }}
                    title="Confirm"
                >
                    <p>are you sure</p>
                </Modal>
            );
        };
        render(<Host />);
        const dialog = document.body.querySelector('[role="dialog"]');
        expect(dialog?.getAttribute('aria-modal')).toBe('true');
        expect(document.body.textContent).toContain('are you sure');
        pressEscape();
        expect(onClose).toHaveBeenCalled();
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });
});

describe('Sheet', () => {
    it('portals a dialog panel and closes on Escape', () => {
        const onClose = vi.fn();
        const Host = () => {
            const [open, setOpen] = React.useState(true);
            return (
                <Sheet
                    open={open}
                    onClose={() => {
                        onClose();
                        setOpen(false);
                    }}
                    title="Options"
                >
                    <p>sheet body</p>
                </Sheet>
            );
        };
        render(<Host />);
        expect(document.body.textContent).toContain('sheet body');
        pressEscape();
        expect(onClose).toHaveBeenCalled();
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });
});

describe('Toast', () => {
    it('shows a toast via useToast and dismisses through the hook', () => {
        let api: ReturnType<typeof useToast> | undefined;
        const Capture = () => {
            api = useToast();
            return null;
        };
        render(
            <ToastProvider>
                <Capture />
            </ToastProvider>,
        );
        let id = '';
        act(() => {
            id = api!.toast({ message: 'Saved', tone: 'success', duration: 0 });
        });
        expect(document.body.textContent).toContain('Saved');
        expect(document.body.querySelector('[role="status"]')).not.toBeNull();
        act(() => {
            api!.dismiss(id);
        });
        expect(document.body.textContent).not.toContain('Saved');
    });
});
