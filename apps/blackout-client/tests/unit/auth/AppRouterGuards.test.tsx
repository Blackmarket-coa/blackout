// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ClientConfigProvider } from '../../../src/app/hooks/useClientConfig';
import { AuthenticatedRoute, LoggedOutOnlyRoute } from '../../../src/app/auth/routeGuards';
import { authStateAtom } from '../../../src/app/state/bmc-auth';
import { getAfterLoginRedirectPath } from '../../../src/app/pages/afterLoginRedirectPath';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

function LocationProbe() {
  const location = useLocation();

  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </div>
  );
}

function renderRouter(initialEntry: string, authState: 'logged_out' | 'logged_in' | 'loading') {
  const store = createStore();
  store.set(authStateAtom, authState);

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  mountedRoots.push(root);

  act(() => {
    root.render(
      <Provider store={store}>
        <ClientConfigProvider
          value={{
            defaultHomeserver: 0,
            homeserverList: ['matrix.theblackout.app'],
            allowCustomHomeservers: true,
          }}
        >
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route
                path="/login/:server?/"
                element={
                  <LoggedOutOnlyRoute>
                    <LocationProbe />
                  </LoggedOutOnlyRoute>
                }
              />
              <Route
                path="/room/:roomId"
                element={
                  <AuthenticatedRoute>
                    <LocationProbe />
                  </AuthenticatedRoute>
                }
              />
              <Route path="/" element={<LocationProbe />} />
            </Routes>
          </MemoryRouter>
        </ClientConfigProvider>
      </Provider>
    );
  });

  return container;
}

describe('auth router guards', () => {
  afterEach(() => {
    act(() => {
      mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('redirects logged out protected routes to the default login path and preserves the original target', async () => {
    const container = renderRouter('/room/demo?tab=overview', 'logged_out');

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
      '/login/matrix.theblackout.app/'
    );
    expect(getAfterLoginRedirectPath()).toBe('/room/demo?tab=overview');
  });

  it('redirects logged in auth routes back to the saved target and clears the redirect marker', async () => {
    localStorage.setItem('after_login_redirect_url', '/room/demo');
    const container = renderRouter('/login/matrix.theblackout.app/', 'logged_in');

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/room/demo');
    expect(getAfterLoginRedirectPath()).toBeUndefined();
  });
});
