// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { factoryRenderLinkifyWithMention } from '../../../src/app/plugins/react-custom-html-parser';

type Rendered = ReactElement<{ href?: string }>;

const renderAnchor = (href: string): Rendered => {
    const render = factoryRenderLinkifyWithMention(() => undefined);
    // The render fn only reads tagName/attributes/content.
    return render({ tagName: 'a', attributes: { href }, content: 'link' } as never) as Rendered;
};

describe('factoryRenderLinkifyWithMention href sanitization', () => {
    it('strips tracking params from auto-linked URLs', () => {
        const el = renderAnchor('https://example.com/?utm_source=x&fbclid=y&keep=1');
        expect(el.props.href).toBe('https://example.com/?keep=1');
    });

    it('leaves clean URLs unchanged', () => {
        const el = renderAnchor('https://example.com/path?page=2');
        expect(el.props.href).toBe('https://example.com/path?page=2');
    });

    it('passes a mention element through when the renderer returns one', () => {
        const sentinel = { type: 'span', props: {}, key: null } as unknown as ReactElement;
        const render = factoryRenderLinkifyWithMention(() => sentinel);
        const el = render({
            tagName: 'a',
            attributes: { href: 'https://matrix.to/#/@a:b.com' },
            content: 'a',
        } as never);
        expect(el).toBe(sentinel);
    });
});
