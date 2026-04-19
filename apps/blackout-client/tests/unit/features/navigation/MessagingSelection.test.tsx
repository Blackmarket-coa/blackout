// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { useDirectSelected } from '../../../../src/app/hooks/router/useDirectSelected';
import {
  useInboxInvitesSelected,
  useInboxNotificationsSelected,
  useInboxSelected,
} from '../../../../src/app/hooks/router/useInbox';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function SelectionProbe() {
  const direct = useDirectSelected();
  const inbox = useInboxSelected();
  const notifications = useInboxNotificationsSelected();
  const invites = useInboxInvitesSelected();

  return (
    <div
      data-testid="selection"
      data-direct={String(direct)}
      data-inbox={String(inbox)}
      data-notifications={String(notifications)}
      data-invites={String(invites)}
    />
  );
}

const renderProbe = (path: string) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);

  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <SelectionProbe />
      </MemoryRouter>
    );
  });

  const probe = container.querySelector('[data-testid="selection"]') as HTMLDivElement;
  const state = {
    direct: probe?.dataset.direct,
    inbox: probe?.dataset.inbox,
    notifications: probe?.dataset.notifications,
    invites: probe?.dataset.invites,
  };

  act(() => {
    root.unmount();
  });
  container.remove();

  return state;
};

describe('messaging route selection hooks', () => {
  it('selects locked-in route without selecting inbox tabs', () => {
    const state = renderProbe('/messages/locked-in/');

    expect(state.direct).toBe('true');
    expect(state.inbox).toBe('false');
    expect(state.notifications).toBe('false');
    expect(state.invites).toBe('false');
  });

  it('selects inbox tab routes independently from direct route', () => {
    const notifications = renderProbe('/messages/notifications/');
    expect(notifications.direct).toBe('false');
    expect(notifications.inbox).toBe('true');
    expect(notifications.notifications).toBe('true');
    expect(notifications.invites).toBe('false');

    const invites = renderProbe('/messages/invites/');
    expect(invites.direct).toBe('false');
    expect(invites.inbox).toBe('true');
    expect(invites.notifications).toBe('false');
    expect(invites.invites).toBe('true');
  });
});
