// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import ClientLayout from '../../../../src/app/pages/client/ClientLayout';
import { rightPanelAtom, selectedRoomIdAtom, selectedSpaceIdAtom } from '../../../../src/app/state/navigation';
import { matrixClientAtom, userIdAtom } from '../../../../src/app/state/auth';
import { composerCommandPayloadAtom } from '../../../../src/app/state/composer';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useInRouterContext: () => false,
    useLocation: () => ({ pathname: '/', search: '' }),
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
    Link: ({ children, ...rest }: React.ComponentProps<'a'>) => <a {...rest}>{children}</a>,
  };
});

let mockRoom: Room | null = null;
let mockEvents: MatrixEvent[] = [];
const mountedRoots: ReactDOM.Root[] = [];
const onboardingCompletionBySpace: Record<string, boolean> = {};
const mockClient = {
  getRooms: () => [] as Room[],
  getUserId: () => '@me:example.org',
  getUser: () => ({ presence: 'online' }),
  getAccountData: vi.fn(() => null),
  setAccountData: vi.fn().mockResolvedValue(undefined),
  sendReadReceipt: vi.fn().mockResolvedValue(undefined),
  leave: vi.fn().mockResolvedValue(undefined),
  joinRoom: vi.fn().mockResolvedValue({ roomId: '!joined:example.org' }),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockClient,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../../../src/app/features/deaddrop', () => ({
  DeadDropComposer: () => null,
  DeadDropIndicator: () => null,
  DeadDropSettings: () => null,
  useDeadDrop: () => ({ data: { enabled: false }, queueCount: 0 }),
}));

vi.mock('../../../../src/app/features/settings', () => ({
  SettingsPage: () => <div data-testid="settings-page">settings page</div>,
}));

vi.mock('../../../../src/app/features/room/MessageComposer', () => ({
  default: () => null,
}));

vi.mock('../../../../src/app/features/room/RoomTimeline', () => ({
  default: ({ jumpToEventId }: { jumpToEventId?: string }) => (
    <div data-testid="timeline" data-jump={jumpToEventId ?? ''}>
      timeline
    </div>
  ),
}));

vi.mock('../../../../src/app/hooks/useRoom', () => ({
  useRoom: () => ({ data: mockRoom, loading: false, error: null }),
}));

vi.mock('../../../../src/app/hooks/useTimeline', () => ({
  useRoomTimeline: () => ({ data: mockEvents, loading: false, error: null, loadMore: vi.fn() }),
}));

vi.mock('../../../../src/app/features/welcome', () => ({
  WelcomeScreen: ({ spaceId }: { spaceId: string }) => <div data-testid="welcome-screen">welcome:{spaceId}</div>,
  OnboardingWizard: ({
    spaceId,
    open,
    onComplete,
  }: {
    spaceId: string;
    open: boolean;
    onClose: () => void;
    onComplete?: () => void;
  }) => {
    if (!open || onboardingCompletionBySpace[spaceId]) return null;
    return (
      <div data-testid="onboarding-wizard">
        onboarding:{spaceId}
        <button
          type="button"
          onClick={() => {
            onboardingCompletionBySpace[spaceId] = true;
            onComplete?.();
          }}
        >
          complete onboarding
        </button>
      </div>
    );
  },
}));

const makeEvent = (
  id: string,
  body: string,
  relType?: string,
  mentions?: { user_ids?: string[]; room?: boolean },
  ts = 1_700_000_000_000,
): MatrixEvent =>
  ({
    getId: () => id,
    getType: () => 'm.room.message',
    getTs: () => ts,
    getContent: () => ({ body, ...(relType ? { 'm.relates_to': { rel_type: relType } } : {}), ...(mentions ? { 'm.mentions': mentions } : {}) }),
  }) as unknown as MatrixEvent;

const makeRoom = ({
  roomId,
  name,
  type,
  children = [],
  timelineEvents = [],
  readUpTo = '$read',
}: {
  roomId: string;
  name: string;
  type?: string;
  children?: Array<{ roomId: string; order?: string }>;
  timelineEvents?: MatrixEvent[];
  readUpTo?: string | null;
}): Room =>
  ({
    roomId,
    name,
    getType: () => type,
    getCanonicalAlias: () => `#${name}:example.org`,
    getUnreadNotificationCount: () => 0,
    getMyMembership: () => 'join',
    getJoinedMembers: () => [],
    getEventReadUpTo: () => readUpTo,
    getLiveTimeline: () => ({
      getEvents: () => timelineEvents,
    }),
    findEventById: (eventId: string) =>
      timelineEvents.find((event) => event.getId() === eventId) ??
      mockEvents.find((event) => event.getId() === eventId) ??
      null,
    currentState: {
      getStateEvents: (eventType: string) => {
        if (eventType === 'm.space.child') {
          return children.map((child) => ({
            getStateKey: () => child.roomId,
            getContent: () => ({ order: child.order }),
          }));
        }
        if (eventType === 'm.room.pinned_events') {
          return { getContent: () => ({ pinned: ['$evt-pin'] }) };
        }
        return [];
      },
    },
  }) as unknown as Room;

const renderLayout = ({
  rooms,
  selectedRoomId,
  selectedSpaceId,
  rightPanel,
}: {
  rooms: Room[];
  selectedRoomId: string | null;
  selectedSpaceId: string | null;
  rightPanel: 'members' | 'threads' | 'pins' | 'search' | 'governance' | null;
}) => {
  mockClient.getRooms = () => rooms;

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  const store = createStore();
  store.set(selectedRoomIdAtom, selectedRoomId);
  store.set(selectedSpaceIdAtom, selectedSpaceId);
  store.set(rightPanelAtom, rightPanel);
  store.set(userIdAtom, '@me:example.org');
  store.set(matrixClientAtom, mockClient as never);

  act(() => {
    root.render(
      <Provider store={store}>
        <ClientLayout />
      </Provider>,
    );
  });

  mountedRoots.push(root);
  return { container, root, store };
};

describe('ClientLayout UI wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    mockEvents = [];
    mockRoom = null;
    Object.keys(onboardingCompletionBySpace).forEach((key) => {
      delete onboardingCompletionBySpace[key];
    });
    mockClient.getAccountData = vi.fn(() => null);
    mockClient.setAccountData.mockClear();
    mockClient.sendReadReceipt.mockClear();
    mockClient.leave.mockClear();
    mockClient.joinRoom.mockClear();
    vi.stubGlobal('prompt', vi.fn(() => '#new-room:example.org'));
  });

  afterEach(() => {
    act(() => {
      mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('threads/pins/search click sets jump target and closes panel', () => {
    const room = makeRoom({ roomId: '!room:example.org', name: 'Room' });
    mockRoom = room;
    mockEvents = [
      makeEvent('$evt-thread', 'thread', 'm.thread'),
      makeEvent('$evt-pin', 'pinned message'),
      makeEvent('$evt-search', 'find me'),
    ];

    const { container } = renderLayout({
      rooms: [room],
      selectedRoomId: '!room:example.org',
      selectedSpaceId: null,
      rightPanel: 'threads',
    });

    const button = container.querySelector('aside button[type="button"]:not([aria-label])') as HTMLButtonElement;
    // click first thread result button inside panel body
    const threadButton = Array.from(container.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes('thread'),
    ) as HTMLButtonElement;

    expect(threadButton).toBeTruthy();
    act(() => threadButton.click());

    expect(container.textContent).not.toContain('Close');
    expect((container.querySelector('[data-testid="timeline"]') as HTMLElement).dataset.jump).toBe('$evt-thread');
    expect(button).toBeTruthy();
  });


  it('governance button opens governance panel', () => {
    const room = makeRoom({ roomId: '!room:example.org', name: 'Room' });
    mockRoom = room;

    const { container } = renderLayout({
      rooms: [room],
      selectedRoomId: '!room:example.org',
      selectedSpaceId: null,
      rightPanel: null,
    });

    const governanceButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'governance') as HTMLButtonElement;
    expect(governanceButton).toBeTruthy();

    act(() => governanceButton.click());

    expect(container.textContent).toContain('Governance Dashboard');
    expect(container.textContent).toContain('Close');
  });

  it('switching rooms closes right panel', async () => {
    const roomA = makeRoom({ roomId: '!room-a:example.org', name: 'Room A' });
    const roomB = makeRoom({ roomId: '!room-b:example.org', name: 'Room B' });
    mockRoom = roomA;

    const { container, store } = renderLayout({
      rooms: [roomA, roomB],
      selectedRoomId: '!room-a:example.org',
      selectedSpaceId: null,
      rightPanel: 'members',
    });

    expect(container.textContent).toContain('Close');

    act(() => {
      store.set(selectedRoomIdAtom, '!room-b:example.org');
    });

    expect(container.textContent).not.toContain('Close');
  });

  it('persists and restores collapsed space groups per selected space', async () => {
    const nestedRoom = makeRoom({ roomId: '!nested:example.org', name: 'Nested' });
    const childSpace = makeRoom({ roomId: '!child-space:example.org', name: 'Child Space', type: 'm.space', children: [{ roomId: '!nested:example.org' }] });
    const rootSpace = makeRoom({
      roomId: '!root-space:example.org',
      name: 'Root Space',
      type: 'm.space',
      children: [{ roomId: '!child-space:example.org', order: 'a' }],
    });
    mockRoom = nestedRoom;

    const rooms = [rootSpace, childSpace, nestedRoom];
    const firstRender = renderLayout({
      rooms,
      selectedRoomId: null,
      selectedSpaceId: '!root-space:example.org',
      rightPanel: null,
    });

    await act(async () => {
      await Promise.resolve();
    });

    const collapseButton = Array.from(firstRender.container.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes('▼'),
    ) as HTMLButtonElement;
    expect(collapseButton).toBeTruthy();

    act(() => collapseButton.click());
    expect(localStorage.getItem('blackout.collapsed.!root-space:example.org')).toContain('true');
    act(() => {
      firstRender.root.unmount();
    });

    const secondRender = renderLayout({
      rooms,
      selectedRoomId: null,
      selectedSpaceId: '!root-space:example.org',
      rightPanel: null,
    });

    expect(secondRender.container.textContent).toContain('▶ General');
  });

  it('opens unified quick switcher from ClientLayout and supports Enter/Escape', async () => {
    const roomA = makeRoom({ roomId: '!room-a:example.org', name: 'Room A' });
    mockRoom = roomA;
    const rooms = [roomA];

    const { container, store } = renderLayout({
      rooms,
      selectedRoomId: null,
      selectedSpaceId: null,
      rightPanel: null,
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });

    const quickInput = container.querySelector('input[placeholder="Search rooms, spaces, users, commands"]') as HTMLInputElement;
    expect(quickInput).toBeTruthy();
    act(() => {
      quickInput.focus();
    });

    act(() => {
      quickInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(store.get(selectedRoomIdAtom)).toBe('!room-a:example.org');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    const reopenedInput = container.querySelector('input[placeholder="Search rooms, spaces, users, commands"]') as HTMLInputElement;
    act(() => {
      reopenedInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(container.querySelector('input[placeholder="Search rooms, spaces, users, commands"]')).toBeNull();
  });

  it('supports ArrowDown/ArrowUp keyboard selection in quick switcher through ClientLayout', async () => {
    const roomA = makeRoom({ roomId: '!room-a:example.org', name: 'Room A' });
    const roomB = makeRoom({ roomId: '!room-b:example.org', name: 'Room B' });
    mockRoom = roomA;

    const { container, store } = renderLayout({
      rooms: [roomA, roomB],
      selectedRoomId: null,
      selectedSpaceId: null,
      rightPanel: null,
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });

    const quickInput = container.querySelector('input[placeholder="Search rooms, spaces, users, commands"]') as HTMLInputElement;
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(store.get(selectedRoomIdAtom)).toBe('!room-b:example.org');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    const reopenedInput = container.querySelector('input[placeholder="Search rooms, spaces, users, commands"]') as HTMLInputElement;
    expect(reopenedInput).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(store.get(selectedRoomIdAtom)).toBe('!room-a:example.org');
  });

  it('queues slash commands into composer payload when command is selected', async () => {
    const roomA = makeRoom({ roomId: '!room-a:example.org', name: 'Room A' });
    mockRoom = roomA;

    const { container, store } = renderLayout({
      rooms: [roomA],
      selectedRoomId: '!room-a:example.org',
      selectedSpaceId: null,
      rightPanel: null,
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    const quickInput = container.querySelector('input[placeholder="Search rooms, spaces, users, commands"]') as HTMLInputElement;
    await act(async () => {
      quickInput.value = '/shrug';
      quickInput.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });

    const shrugCommandButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('/shrug'),
    ) as HTMLButtonElement;
    act(() => {
      shrugCommandButton.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(store.get(composerCommandPayloadAtom)?.text).toBe('/shrug');
    expect(container.textContent).toContain('Ready to send /shrug.');
  });

  it('shows validation message when room-scoped command is picked without a room', async () => {
    const roomA = makeRoom({ roomId: '!room-a:example.org', name: 'Room A' });
    mockRoom = roomA;

    const { container } = renderLayout({
      rooms: [roomA],
      selectedRoomId: null,
      selectedSpaceId: null,
      rightPanel: null,
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    const quickInput = container.querySelector('input[placeholder="Search rooms, spaces, users, commands"]') as HTMLInputElement;
    await act(async () => {
      quickInput.value = '/topic';
      quickInput.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });

    const topicCommandButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('/topic'),
    ) as HTMLButtonElement;
    act(() => {
      topicCommandButton.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Select a room before using /topic.');
  });

  it('runs direct /leave and /join command actions from quick switcher', async () => {
    const roomA = makeRoom({ roomId: '!room-a:example.org', name: 'Room A' });
    mockRoom = roomA;

    const { container, store } = renderLayout({
      rooms: [roomA],
      selectedRoomId: '!room-a:example.org',
      selectedSpaceId: null,
      rightPanel: null,
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    const leaveInput = container.querySelector('input[placeholder="Search rooms, spaces, users, commands"]') as HTMLInputElement;
    await act(async () => {
      leaveInput.value = '/leave';
      leaveInput.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });

    const leaveCommandButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('/leave'),
    ) as HTMLButtonElement;
    act(() => {
      leaveCommandButton.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockClient.leave).toHaveBeenCalledWith('!room-a:example.org');
    expect(store.get(selectedRoomIdAtom)).toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    const joinInput = container.querySelector('input[placeholder="Search rooms, spaces, users, commands"]') as HTMLInputElement;
    await act(async () => {
      joinInput.value = '/join';
      joinInput.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });

    const joinCommandButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('/join'),
    ) as HTMLButtonElement;
    act(() => {
      joinCommandButton.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockClient.joinRoom).toHaveBeenCalledWith('#new-room:example.org');
    expect(store.get(selectedRoomIdAtom)).toBe('!joined:example.org');
  });

  it('handles malformed inbox account-data shape without crashing and rewrites normalized state', async () => {
    mockClient.getAccountData = vi.fn(() => ({
      getContent: () => ({ '@me:example.org': 'invalid-shape' }),
    }));
    const room = makeRoom({ roomId: '!room:example.org', name: 'Room' });
    mockRoom = room;

    renderLayout({
      rooms: [room],
      selectedRoomId: null,
      selectedSpaceId: null,
      rightPanel: null,
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockClient.setAccountData).toHaveBeenCalledWith(
      'blackout.inbox.read.v1',
      expect.objectContaining({ version: 2, users: expect.any(Object) }),
    );
  });

  it('ignores stale read IDs that are not present in room timelines', async () => {
    mockClient.getAccountData = vi.fn(() => ({
      getContent: () => ({ '@me:example.org': { '$stale': true } }),
    }));
    const mention = makeEvent('$mention', 'hello', undefined, { user_ids: ['@me:example.org'] });
    const room = makeRoom({
      roomId: '!room:example.org',
      name: 'Room',
      timelineEvents: [mention],
      readUpTo: null,
    });
    mockRoom = room;

    const { container } = renderLayout({
      rooms: [room],
      selectedRoomId: null,
      selectedSpaceId: null,
      rightPanel: null,
    });

    act(() => {
      const inboxButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Inbox'));
      inboxButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Unread');
  });

  it('reconciles cross-device receipt advancement as read without local click', async () => {
    const mention = makeEvent('$mention-read', 'cross device', undefined, { user_ids: ['@me:example.org'] }, 1_700_000_000_100);
    const readMarker = makeEvent('$read-anchor', 'anchor', undefined, undefined, 1_700_000_000_200);
    const room = makeRoom({
      roomId: '!room:example.org',
      name: 'Room',
      timelineEvents: [mention, readMarker],
      readUpTo: '$read-anchor',
    });
    mockRoom = room;

    const { container } = renderLayout({
      rooms: [room],
      selectedRoomId: null,
      selectedSpaceId: null,
      rightPanel: null,
    });

    act(() => {
      const inboxButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Inbox'));
      inboxButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Read');
  });

  it('shows onboarding wizard for incomplete users in the active space', () => {
    const room = makeRoom({ roomId: '!room:example.org', name: 'Room' });
    const space = makeRoom({ roomId: '!space:example.org', name: 'Space', type: 'm.space' });
    mockRoom = room;

    const { container } = renderLayout({
      rooms: [space, room],
      selectedRoomId: null,
      selectedSpaceId: '!space:example.org',
      rightPanel: null,
    });

    expect(container.querySelector('[data-testid=\"onboarding-wizard\"]')?.textContent).toContain('onboarding:!space:example.org');
  });

  it('hides onboarding wizard immediately after completion', async () => {
    const room = makeRoom({ roomId: '!room:example.org', name: 'Room' });
    const space = makeRoom({ roomId: '!space:example.org', name: 'Space', type: 'm.space' });
    mockRoom = room;

    const { container } = renderLayout({
      rooms: [space, room],
      selectedRoomId: null,
      selectedSpaceId: '!space:example.org',
      rightPanel: null,
    });

    const completeButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('complete onboarding'),
    ) as HTMLButtonElement;
    expect(completeButton).toBeTruthy();

    act(() => completeButton.click());
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid=\"onboarding-wizard\"]')).toBeNull();
  });

  it('does not show onboarding wizard again for returning users', () => {
    onboardingCompletionBySpace['!space:example.org'] = true;
    const room = makeRoom({ roomId: '!room:example.org', name: 'Room' });
    const space = makeRoom({ roomId: '!space:example.org', name: 'Space', type: 'm.space' });
    mockRoom = room;

    const { container } = renderLayout({
      rooms: [space, room],
      selectedRoomId: null,
      selectedSpaceId: '!space:example.org',
      rightPanel: null,
    });

    expect(container.querySelector('[data-testid=\"onboarding-wizard\"]')).toBeNull();
  });
});
