import { fireEvent, waitFor } from "@testing-library/dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../src/api/client";
import { BlackoutWebApp } from "../../src/app";

type MockApi = {
  login: (username: string, password: string) => Promise<{ jwt: string; user: { id: string; username: string } }>;
  register: (username: string, password: string) => Promise<{ jwt: string; user: { id: string; username: string } }>;
  getServers: () => Promise<Array<{ id: string; name: string; role: string }>>;
  getServerDetails: () => Promise<{ id: string; name: string; channels: Array<{ id: string; name: string }> }>;
  getMessages: (_session: unknown, channelId: string) => Promise<Array<{ id: string; sender: string; body: string; timestamp: string }>>;
  sendMessage: (_session: unknown, _channelId: string, body: string) => Promise<{ id: string; sender: string; body: string; timestamp: string }>;
  createServer: () => Promise<{ id: string; name: string; role: string }>;
  createChannel: () => Promise<{ id: string; name: string }>;
  registerDevicePushToken: () => Promise<void>;
  unregisterDevicePushToken: () => Promise<void>;
  connectGateway: () => null;
};

const baseSession = { jwt: "mock-jwt", user: { id: "usr_1", username: "alice" } };
const baseServers = [{ id: "srv_alpha", name: "Alpha Ops", role: "owner" }];
const baseChannels = [
  { id: "chn_general", name: "general" },
  { id: "chn_ops", name: "ops" },
];

function createMockApi(overrides: Partial<MockApi> = {}): MockApi {
  return {
    login: async () => baseSession,
    register: async () => baseSession,
    getServers: async () => baseServers,
    getServerDetails: async () => ({ id: "srv_alpha", name: "Alpha Ops", channels: baseChannels }),
    getMessages: async (_session, channelId) => [
      { id: `${channelId}-m1`, sender: "alice", body: `hello ${channelId}`, timestamp: new Date().toISOString() },
    ],
    sendMessage: async (_session, _channelId, body) => ({ id: `msg-${Date.now()}`, sender: "alice", body, timestamp: new Date().toISOString() }),
    createServer: async () => ({ id: "srv_new", name: "New server", role: "owner" }),
    createChannel: async () => ({ id: "chn_new", name: "new-room" }),
    registerDevicePushToken: async () => undefined,
    unregisterDevicePushToken: async () => undefined,
    connectGateway: () => null,
    ...overrides,
  };
}

async function mountMobileHarness(overrides: Partial<MockApi> = {}): Promise<{ app: BlackoutWebApp; root: HTMLElement; api: MockApi }> {
  document.body.innerHTML = `<div id="app"></div>`;
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing app root");
  const app = new BlackoutWebApp(root);
  await app.mount();
  const api = createMockApi(overrides);
  Reflect.set(app as unknown as object, "api", api);
  return { app, root, api };
}

async function signIn(root: HTMLElement, values: { homeserverUrl?: string; username?: string; password?: string } = {}): Promise<void> {
  fireEvent.input(root.querySelector("input[name='homeserverUrl']") as HTMLInputElement, {
    target: { value: values.homeserverUrl ?? "https://matrix.blackout.local" },
  });
  fireEvent.input(root.querySelector("input[name='username']") as HTMLInputElement, {
    target: { value: values.username ?? "alice" },
  });
  fireEvent.input(root.querySelector("input[name='password']") as HTMLInputElement, {
    target: { value: values.password ?? "secret" },
  });
  fireEvent.submit(root.querySelector("#auth-form") as HTMLFormElement);
}

const requireElement = <T extends Element>(root: HTMLElement, selector: string): T => {
  const element = root.querySelector<T>(selector);
  expect(element, `missing required element: ${selector}`).toBeTruthy();
  return element as T;
};

const waitForSignedInWorkspace = async (root: HTMLElement): Promise<void> => {
  await waitFor(() => {
    expect(root.querySelector("[data-action='open-server'][data-server-id='srv_alpha']")).toBeTruthy();
  });
};

describe("mobile automation harness (webview contract)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("AI-M-AUTH-001 invalid credentials deterministic error", async () => {
    const { root } = await mountMobileHarness({
      login: async (_username, password) => {
        if (password !== "secret") throw new ApiError("Invalid credentials", 401, "M_FORBIDDEN");
        return baseSession;
      },
    });

    await signIn(root, { password: "wrong-password" });

    await waitFor(() => {
      expect(root.textContent).toContain("Invalid credentials");
      expect(root.querySelector("#auth-form")).toBeTruthy();
    });
  });

  it("AI-M-AUTH-002 homeserver URL validation blocks request", async () => {
    const { root, api } = await mountMobileHarness();
    const loginSpy = vi.spyOn(api, "login");

    await signIn(root, { homeserverUrl: "not-a-valid-url", password: "secret" });

    expect(root.textContent).toContain("Enter a valid homeserver URL");
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it("AI-M-TAB-001 room navigation switches active room context", async () => {
    const { root } = await mountMobileHarness();
    await signIn(root);
    await waitForSignedInWorkspace(root);

    await waitFor(() => expect(root.querySelector(".chat-head")?.textContent).toContain("general"));
    fireEvent.click(requireElement<HTMLButtonElement>(root, "[data-action='open-channel'][data-channel-id='chn_ops']"));
    await waitFor(() => expect(root.querySelector(".chat-head")?.textContent).toContain("ops"));
  });

  it("AI-M-TAB-002 empty-state is rendered for empty room timeline", async () => {
    const { root } = await mountMobileHarness({
      getMessages: async () => [],
    });
    await signIn(root);
    await waitForSignedInWorkspace(root);

    await waitFor(() => {
      expect(root.querySelector(".message-list .empty")?.textContent).toContain("No messages yet");
    });
  });

  it("AI-M-RM-001 composer send availability reflects room selection", async () => {
    const { root } = await mountMobileHarness();
    const formBeforeSignIn = root.querySelector<HTMLFormElement>("#message-form");
    expect(formBeforeSignIn).toBeNull();

    await signIn(root);
    await waitForSignedInWorkspace(root);
    const sendButton = root.querySelector<HTMLButtonElement>("#message-form button[type='submit']");
    expect(sendButton?.disabled).toBe(false);
  });

  it("AI-M-RM-002 timeline loading marker appears then clears", async () => {
    const { root } = await mountMobileHarness({
      getMessages: async (_session, channelId) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return [{ id: `${channelId}-m1`, sender: "alice", body: "loaded", timestamp: new Date().toISOString() }];
      },
    });

    await signIn(root);
    await waitForSignedInWorkspace(root);
    await waitFor(() => expect(root.textContent).toContain("Syncing workspace…"));
    await waitFor(() => expect(root.textContent).not.toContain("Syncing workspace…"));
  });

  it("AI-M-RM-003 context actions route to expected workspace outcomes", async () => {
    const { root } = await mountMobileHarness();
    await signIn(root);
    await waitForSignedInWorkspace(root);

    fireEvent.click(requireElement<HTMLButtonElement>(root, "[data-action='open-dms-panel']"));
    fireEvent.click(requireElement<HTMLButtonElement>(root, "[data-action='dm-open-friends']"));
    expect(root.textContent).toContain("Allies shortcuts map to direct-message contacts");

    fireEvent.click(requireElement<HTMLButtonElement>(root, "[data-action='dm-open-quests']"));
    expect(root.textContent).toContain("Missions opened in Revenue Ops");
  });
});
