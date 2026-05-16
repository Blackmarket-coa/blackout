// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GovernanceMeetings } from '../../../../src/app/features/governance/GovernanceMeetings';
import type { GovernanceMeetingPayload } from '@blackout/protocol';

type ListResponse = { items: GovernanceMeetingPayload[] };

type MeetingFetcher = {
    listMeetings: ReturnType<typeof vi.fn>;
    scheduleMeeting: ReturnType<typeof vi.fn>;
    cancelMeeting: ReturnType<typeof vi.fn>;
};

const meeting = (overrides: Partial<GovernanceMeetingPayload> = {}): GovernanceMeetingPayload => ({
    meetingId: 'meet-1',
    title: 'Quarterly town hall',
    startsAt: '2026-06-01T15:00:00.000Z',
    endsAt: '2026-06-01T16:00:00.000Z',
    agenda: 'Quarterly updates',
    location: 'https://example.org/call',
    attendees: [],
    status: 'scheduled',
    ...overrides,
});

const createFetcher = (overrides: Partial<MeetingFetcher> = {}): MeetingFetcher => ({
    listMeetings: vi.fn(async (): Promise<ListResponse> => ({ items: [] })),
    scheduleMeeting: vi.fn(async () => ({})),
    cancelMeeting: vi.fn(async () => ({})),
    ...overrides,
});

const mountPage = async (fetcher: MeetingFetcher) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(
            <GovernanceMeetings
                listMeetings={
                    fetcher.listMeetings as unknown as React.ComponentProps<
                        typeof GovernanceMeetings
                    >['listMeetings']
                }
                scheduleMeeting={
                    fetcher.scheduleMeeting as unknown as React.ComponentProps<
                        typeof GovernanceMeetings
                    >['scheduleMeeting']
                }
                cancelMeeting={
                    fetcher.cancelMeeting as unknown as React.ComponentProps<
                        typeof GovernanceMeetings
                    >['cancelMeeting']
                }
            />
        );
        // Allow the initial listMeetings effect + setState to flush.
        await Promise.resolve();
        await Promise.resolve();
    });

    return { container, root };
};

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const setter =
        input instanceof HTMLTextAreaElement
            ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
            : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('GovernanceMeetings (BKL-003 Port 2 — scheduler form + listing)', () => {
    it('renders the empty-state when listMeetings returns no items', async () => {
        const fetcher = createFetcher();
        const { container } = await mountPage(fetcher);

        expect(container.querySelector('[data-testid="governance-meetings"]')).toBeTruthy();
        expect(container.textContent).toContain('No meetings scheduled yet.');
        expect(fetcher.listMeetings).toHaveBeenCalled();
    });

    it('renders each meeting row with status badge and cancel button when not cancelled', async () => {
        const fetcher = createFetcher({
            listMeetings: vi.fn(async () => ({
                items: [
                    meeting({ meetingId: 'm-up', title: 'Upcoming sync', status: 'scheduled' }),
                    meeting({
                        meetingId: 'm-done',
                        title: 'Past retro',
                        status: 'completed',
                    }),
                    meeting({
                        meetingId: 'm-cancel',
                        title: 'Cancelled call',
                        status: 'cancelled',
                    }),
                ],
            })),
        });

        const { container } = await mountPage(fetcher);

        const upcoming = container.querySelector('[data-testid="governance-meetings-row-m-up"]');
        expect(upcoming?.textContent).toContain('Upcoming sync');
        expect(upcoming?.textContent).toContain('scheduled');
        expect(
            upcoming?.querySelector('[data-testid="governance-meetings-cancel-m-up"]')
        ).not.toBeNull();

        const past = container.querySelector('[data-testid="governance-meetings-row-m-done"]');
        expect(past?.textContent).toContain('completed');
        expect(
            past?.querySelector('[data-testid="governance-meetings-cancel-m-done"]')
        ).not.toBeNull();

        const cancelled = container.querySelector(
            '[data-testid="governance-meetings-row-m-cancel"]'
        );
        expect(cancelled?.textContent).toContain('cancelled');
        // Cancel button hidden when meeting is already cancelled.
        expect(
            cancelled?.querySelector('[data-testid="governance-meetings-cancel-m-cancel"]')
        ).toBeNull();
    });

    it('rejects submit when title is empty and surfaces the validation error', async () => {
        const fetcher = createFetcher();
        const { container } = await mountPage(fetcher);

        const form = container.querySelector(
            '[data-testid="governance-meetings-form"]'
        ) as HTMLFormElement;
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
        });

        const errorEl = container.querySelector('[data-testid="governance-meetings-error"]');
        expect(errorEl?.textContent).toContain('Title, starts at, and ends at are required.');
        expect(fetcher.scheduleMeeting).not.toHaveBeenCalled();
    });

    it('posts a GovernanceMeetingPayload on submit and refreshes the meetings list', async () => {
        const fetcher = createFetcher({
            listMeetings: vi
                .fn()
                // First call (mount): empty.
                .mockResolvedValueOnce({ items: [] })
                // Second call (post-submit refresh): contains the new meeting.
                .mockResolvedValueOnce({
                    items: [meeting({ meetingId: 'meet-fixed', title: 'Quarterly sync' })],
                }),
        });

        const { container } = await mountPage(fetcher);

        const titleInput = container.querySelector(
            '[data-testid="governance-meetings-title"]'
        ) as HTMLInputElement;
        const idInput = container.querySelector(
            '[data-testid="governance-meetings-id"]'
        ) as HTMLInputElement;
        const agendaInput = container.querySelector(
            '[data-testid="governance-meetings-agenda"]'
        ) as HTMLTextAreaElement;
        const locationInput = container.querySelector(
            '[data-testid="governance-meetings-location"]'
        ) as HTMLInputElement;
        const proposalInput = container.querySelector(
            '[data-testid="governance-meetings-proposal"]'
        ) as HTMLInputElement;

        await act(async () => {
            setInputValue(titleInput, 'Quarterly sync');
            setInputValue(idInput, 'meet-fixed');
            setInputValue(agendaInput, 'Updates and Q&A');
            setInputValue(locationInput, 'https://example.org/call');
            setInputValue(proposalInput, 'prop-7');
            await Promise.resolve();
        });

        const form = container.querySelector(
            '[data-testid="governance-meetings-form"]'
        ) as HTMLFormElement;
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            // Allow scheduleMeeting → refresh → listMeetings → setState to flush.
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.scheduleMeeting).toHaveBeenCalledTimes(1);
        const payload = fetcher.scheduleMeeting.mock.calls[0][0] as GovernanceMeetingPayload;
        expect(payload.meetingId).toBe('meet-fixed');
        expect(payload.title).toBe('Quarterly sync');
        expect(payload.agenda).toBe('Updates and Q&A');
        expect(payload.location).toBe('https://example.org/call');
        expect(payload.relatedProposalId).toBe('prop-7');
        expect(payload.status).toBe('scheduled');
        expect(payload.attendees).toEqual([]);
        // ISO-8601 round trip preserved.
        expect(payload.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(payload.endsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

        // listMeetings called twice: initial mount + post-submit refresh.
        expect(fetcher.listMeetings).toHaveBeenCalledTimes(2);
        // The refreshed row is in the DOM.
        expect(
            container.querySelector('[data-testid="governance-meetings-row-meet-fixed"]')
        ).not.toBeNull();
    });

    it('calls cancelMeeting and refreshes when the row cancel button is clicked', async () => {
        const fetcher = createFetcher({
            listMeetings: vi
                .fn()
                .mockResolvedValueOnce({
                    items: [meeting({ meetingId: 'm-cancel-target', title: 'Doomed' })],
                })
                // After cancel, listMeetings returns the same row with status=cancelled.
                .mockResolvedValueOnce({
                    items: [
                        meeting({
                            meetingId: 'm-cancel-target',
                            title: 'Doomed',
                            status: 'cancelled',
                        }),
                    ],
                }),
        });

        const { container } = await mountPage(fetcher);

        const cancelBtn = container.querySelector(
            '[data-testid="governance-meetings-cancel-m-cancel-target"]'
        ) as HTMLButtonElement;
        expect(cancelBtn).not.toBeNull();

        await act(async () => {
            cancelBtn.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.cancelMeeting).toHaveBeenCalledWith('m-cancel-target');
        expect(fetcher.listMeetings).toHaveBeenCalledTimes(2);
        const row = container.querySelector(
            '[data-testid="governance-meetings-row-m-cancel-target"]'
        );
        expect(row?.textContent).toContain('cancelled');
    });

    it('surfaces load errors via role="alert"', async () => {
        const fetcher = createFetcher({
            listMeetings: vi.fn(async () => {
                throw new Error('upstream unavailable');
            }),
        });

        const { container } = await mountPage(fetcher);

        const alerts = container.querySelectorAll('[role="alert"]');
        const messages = Array.from(alerts).map((el) => el.textContent ?? '');
        expect(messages.some((m) => m.includes('upstream unavailable'))).toBe(true);
    });
});
