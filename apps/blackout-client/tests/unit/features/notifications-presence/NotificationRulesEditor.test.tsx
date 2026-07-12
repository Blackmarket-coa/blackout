// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationRulesEditor } from '../../../../src/app/features/notifications-presence/NotificationRulesEditor';
import type { NotificationRulePayload } from '@blackout/protocol';

type RulesFetcher = {
    fetchNotificationRules: ReturnType<typeof vi.fn>;
    upsertNotificationRule: ReturnType<typeof vi.fn>;
    deleteNotificationRule: ReturnType<typeof vi.fn>;
};

const rule = (overrides: Partial<NotificationRulePayload> = {}): NotificationRulePayload => ({
    feature: 'mentions',
    category: 'dm',
    hardCapPerDay: 50,
    cooldownMinutes: 5,
    ...overrides,
});

const createFetcher = (overrides: Partial<RulesFetcher> = {}): RulesFetcher => ({
    fetchNotificationRules: vi.fn(async () => ({ subject: '@me:example.org', rules: [] })),
    upsertNotificationRule: vi.fn(async (r: NotificationRulePayload) => r),
    deleteNotificationRule: vi.fn(async () => undefined),
    ...overrides,
});

const mountEditor = async (fetcher: RulesFetcher) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(
            <NotificationRulesEditor
                fetchNotificationRules={
                    fetcher.fetchNotificationRules as unknown as React.ComponentProps<
                        typeof NotificationRulesEditor
                    >['fetchNotificationRules']
                }
                upsertNotificationRule={
                    fetcher.upsertNotificationRule as unknown as React.ComponentProps<
                        typeof NotificationRulesEditor
                    >['upsertNotificationRule']
                }
                deleteNotificationRule={
                    fetcher.deleteNotificationRule as unknown as React.ComponentProps<
                        typeof NotificationRulesEditor
                    >['deleteNotificationRule']
                }
            />
        );
        await Promise.resolve();
        await Promise.resolve();
    });

    return { container, root };
};

const setInputValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

const setCheckbox = (input: HTMLInputElement, checked: boolean) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
    setter?.call(input, checked);
    input.dispatchEvent(new Event('click', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('NotificationRulesEditor (BKL-004 Port 3 — rule CRUD)', () => {
    it('renders the empty-state when fetchNotificationRules returns no rules', async () => {
        const fetcher = createFetcher();
        const { container } = await mountEditor(fetcher);

        expect(container.querySelector('[data-testid="notification-rules-editor"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="notification-rules-empty"]')).toBeTruthy();
        expect(fetcher.fetchNotificationRules).toHaveBeenCalled();
    });

    it('renders each rule row with edit and delete buttons', async () => {
        const fetcher = createFetcher({
            fetchNotificationRules: vi.fn(async () => ({
                subject: '@me:example.org',
                rules: [
                    rule({ feature: 'mentions', category: 'dm' }),
                    rule({
                        feature: 'reactions',
                        category: 'room',
                        hardCapPerDay: 25,
                        cooldownMinutes: 10,
                        quietHours: { startUtc: '23:00', endUtc: '06:00' },
                    }),
                ],
            })),
        });

        const { container } = await mountEditor(fetcher);

        const dmRow = container.querySelector('[data-testid="notification-rules-row-mentions:dm"]');
        expect(dmRow?.textContent).toContain('mentions:dm');
        expect(dmRow?.textContent).toContain('cap 50/day');
        expect(
            dmRow?.querySelector('[data-testid="notification-rules-edit-mentions:dm"]')
        ).not.toBeNull();
        expect(
            dmRow?.querySelector('[data-testid="notification-rules-delete-mentions:dm"]')
        ).not.toBeNull();

        const reactionsRow = container.querySelector(
            '[data-testid="notification-rules-row-reactions:room"]'
        );
        expect(reactionsRow?.textContent).toContain('cap 25/day');
        expect(reactionsRow?.textContent).toContain('cooldown 10m');
        expect(reactionsRow?.textContent).toContain('Quiet 23:00–06:00 UTC');
    });

    it('rejects submit when feature or category is blank', async () => {
        const fetcher = createFetcher();
        const { container } = await mountEditor(fetcher);

        const form = container.querySelector(
            '[data-testid="notification-rules-form"]'
        ) as HTMLFormElement;
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
        });

        const error = container.querySelector('[data-testid="notification-rules-submit-error"]');
        expect(error?.textContent).toContain('Feature and category are required.');
        expect(fetcher.upsertNotificationRule).not.toHaveBeenCalled();
    });

    it('optimistically appends a new rule to the list before the SDK call resolves', async () => {
        let resolveUpsert: (value: NotificationRulePayload) => void = () => {};
        const upsertPromise = new Promise<NotificationRulePayload>((resolve) => {
            resolveUpsert = resolve;
        });
        const fetcher = createFetcher({
            upsertNotificationRule: vi.fn(() => upsertPromise),
        });

        const { container } = await mountEditor(fetcher);

        const featureInput = container.querySelector(
            '[data-testid="notification-rules-feature"]'
        ) as HTMLInputElement;
        const categoryInput = container.querySelector(
            '[data-testid="notification-rules-category"]'
        ) as HTMLInputElement;

        await act(async () => {
            setInputValue(featureInput, 'mentions');
            setInputValue(categoryInput, 'space');
            await Promise.resolve();
        });

        const form = container.querySelector(
            '[data-testid="notification-rules-form"]'
        ) as HTMLFormElement;

        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
        });

        // Row appears immediately, before resolveUpsert() is called.
        expect(
            container.querySelector('[data-testid="notification-rules-row-mentions:space"]')
        ).not.toBeNull();

        await act(async () => {
            resolveUpsert(rule({ feature: 'mentions', category: 'space' }));
            await Promise.resolve();
        });

        expect(fetcher.upsertNotificationRule).toHaveBeenCalledTimes(1);
        const sentPayload = fetcher.upsertNotificationRule.mock
            .calls[0][0] as NotificationRulePayload;
        expect(sentPayload.feature).toBe('mentions');
        expect(sentPayload.category).toBe('space');
        expect(sentPayload.hardCapPerDay).toBe(50);
        expect(sentPayload.cooldownMinutes).toBe(5);
        expect(sentPayload.quietHours).toBeUndefined();
    });

    it('rolls back the optimistic insert and surfaces an alert when upsert fails', async () => {
        const fetcher = createFetcher({
            upsertNotificationRule: vi.fn(async () => {
                throw new Error('server rejected rule');
            }),
        });

        const { container } = await mountEditor(fetcher);

        const featureInput = container.querySelector(
            '[data-testid="notification-rules-feature"]'
        ) as HTMLInputElement;
        const categoryInput = container.querySelector(
            '[data-testid="notification-rules-category"]'
        ) as HTMLInputElement;

        await act(async () => {
            setInputValue(featureInput, 'mentions');
            setInputValue(categoryInput, 'dm');
            await Promise.resolve();
        });

        const form = container.querySelector(
            '[data-testid="notification-rules-form"]'
        ) as HTMLFormElement;

        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
            await Promise.resolve();
        });

        // Optimistic row is gone (rollback).
        expect(
            container.querySelector('[data-testid="notification-rules-row-mentions:dm"]')
        ).toBeNull();
        // Alert surfaced.
        const error = container.querySelector('[data-testid="notification-rules-submit-error"]');
        expect(error?.textContent).toContain('server rejected rule');
    });

    it('deletes a rule optimistically and calls deleteNotificationRule with feature/category', async () => {
        const fetcher = createFetcher({
            fetchNotificationRules: vi.fn(async () => ({
                subject: '@me:example.org',
                rules: [rule({ feature: 'mentions', category: 'dm' })],
            })),
        });

        const { container } = await mountEditor(fetcher);

        expect(
            container.querySelector('[data-testid="notification-rules-row-mentions:dm"]')
        ).not.toBeNull();

        const deleteBtn = container.querySelector(
            '[data-testid="notification-rules-delete-mentions:dm"]'
        ) as HTMLButtonElement;
        expect(deleteBtn).not.toBeNull();

        await act(async () => {
            deleteBtn.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.deleteNotificationRule).toHaveBeenCalledWith('mentions', 'dm', undefined);
        expect(
            container.querySelector('[data-testid="notification-rules-row-mentions:dm"]')
        ).toBeNull();
    });

    it('saves and deletes room-scoped overrides alongside the category-wide rule', async () => {
        const ROOM = '!busy:example.org';
        const fetcher = createFetcher({
            fetchNotificationRules: vi.fn(async () => ({
                subject: '@me:example.org',
                rules: [rule({ feature: 'mentions', category: 'room' })],
            })),
        });

        const { container } = await mountEditor(fetcher);

        // Fill the form with a room-scoped override for the same key.
        setInputValue(
            container.querySelector(
                '[data-testid="notification-rules-feature"]'
            ) as HTMLInputElement,
            'mentions'
        );
        setInputValue(
            container.querySelector(
                '[data-testid="notification-rules-category"]'
            ) as HTMLInputElement,
            'room'
        );
        setInputValue(
            container.querySelector('[data-testid="notification-rules-room"]') as HTMLInputElement,
            ROOM
        );

        const form = container.querySelector(
            '[data-testid="notification-rules-form"]'
        ) as HTMLFormElement;
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.upsertNotificationRule).toHaveBeenCalledWith(
            expect.objectContaining({ feature: 'mentions', category: 'room', roomId: ROOM })
        );

        // Both the category-wide row and the room-scoped row render (distinct keys).
        expect(
            container.querySelector('[data-testid="notification-rules-row-mentions:room"]')
        ).not.toBeNull();
        const scopedRow = container.querySelector(
            `[data-testid="notification-rules-row-mentions:room:${ROOM}"]`
        );
        expect(scopedRow).not.toBeNull();

        // Deleting the scoped row passes the roomId and leaves the wide rule.
        const scopedDelete = scopedRow?.querySelector(
            `[data-testid="notification-rules-delete-mentions:room:${ROOM}"]`
        ) as HTMLButtonElement;
        await act(async () => {
            scopedDelete.click();
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(fetcher.deleteNotificationRule).toHaveBeenCalledWith('mentions', 'room', ROOM);
        expect(
            container.querySelector('[data-testid="notification-rules-row-mentions:room"]')
        ).not.toBeNull();
    });

    it('populates the form with the rule values when Edit is clicked', async () => {
        const fetcher = createFetcher({
            fetchNotificationRules: vi.fn(async () => ({
                subject: '@me:example.org',
                rules: [
                    rule({
                        feature: 'reactions',
                        category: 'room',
                        hardCapPerDay: 30,
                        cooldownMinutes: 7,
                        quietHours: { startUtc: '22:00', endUtc: '07:00' },
                    }),
                ],
            })),
        });

        const { container } = await mountEditor(fetcher);

        const editBtn = container.querySelector(
            '[data-testid="notification-rules-edit-reactions:room"]'
        ) as HTMLButtonElement;
        await act(async () => {
            editBtn.click();
            await Promise.resolve();
        });

        const featureInput = container.querySelector(
            '[data-testid="notification-rules-feature"]'
        ) as HTMLInputElement;
        const categoryInput = container.querySelector(
            '[data-testid="notification-rules-category"]'
        ) as HTMLInputElement;
        const capInput = container.querySelector(
            '[data-testid="notification-rules-hardcap"]'
        ) as HTMLInputElement;
        const cooldownInput = container.querySelector(
            '[data-testid="notification-rules-cooldown"]'
        ) as HTMLInputElement;
        const quietToggle = container.querySelector(
            '[data-testid="notification-rules-quiet-toggle"]'
        ) as HTMLInputElement;

        expect(featureInput.value).toBe('reactions');
        expect(categoryInput.value).toBe('room');
        expect(capInput.value).toBe('30');
        expect(cooldownInput.value).toBe('7');
        expect(quietToggle.checked).toBe(true);

        const quietStart = container.querySelector(
            '[data-testid="notification-rules-quiet-start"]'
        ) as HTMLInputElement;
        const quietEnd = container.querySelector(
            '[data-testid="notification-rules-quiet-end"]'
        ) as HTMLInputElement;
        expect(quietStart.value).toBe('22:00');
        expect(quietEnd.value).toBe('07:00');
    });

    it('sends quietHours in the payload when the toggle is on', async () => {
        const fetcher = createFetcher();
        const { container } = await mountEditor(fetcher);

        const featureInput = container.querySelector(
            '[data-testid="notification-rules-feature"]'
        ) as HTMLInputElement;
        const categoryInput = container.querySelector(
            '[data-testid="notification-rules-category"]'
        ) as HTMLInputElement;
        const quietToggle = container.querySelector(
            '[data-testid="notification-rules-quiet-toggle"]'
        ) as HTMLInputElement;

        await act(async () => {
            setInputValue(featureInput, 'mentions');
            setInputValue(categoryInput, 'space');
            setCheckbox(quietToggle, true);
            await Promise.resolve();
        });

        const form = container.querySelector(
            '[data-testid="notification-rules-form"]'
        ) as HTMLFormElement;

        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
            await Promise.resolve();
        });

        const payload = fetcher.upsertNotificationRule.mock.calls[0][0] as NotificationRulePayload;
        expect(payload.quietHours).toEqual({ startUtc: '22:00', endUtc: '07:00' });
    });

    it('surfaces load errors via role="alert"', async () => {
        const fetcher = createFetcher({
            fetchNotificationRules: vi.fn(async () => {
                throw new Error('rules backend down');
            }),
        });

        const { container } = await mountEditor(fetcher);

        const error = container.querySelector('[data-testid="notification-rules-load-error"]');
        expect(error?.textContent).toContain('rules backend down');
        expect(error?.getAttribute('role')).toBe('alert');
    });
});
