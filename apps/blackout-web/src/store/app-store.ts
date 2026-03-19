import type { ChannelSummary, ChatMessage, ServerSummary, Session } from "../types";

const NAV_STORAGE_KEY = "blackout.web.navigation";

export type PendingCreate = "none" | "server" | "channel";

export interface LoadingState {
  auth: boolean;
  servers: boolean;
  channels: boolean;
  messages: boolean;
  send: boolean;
}

export interface AppState {
  session: Session | null;
  servers: ServerSummary[];
  activeServerId: string | null;
  channels: ChannelSummary[];
  activeChannelId: string | null;
  messages: ChatMessage[];
  loading: LoadingState;
  authMode: "login" | "register";
  pendingCreate: PendingCreate;
  createName: string;
  createError: string | null;
  error: string | null;
  unreadByChannel: Record<string, number>;
}

interface PersistedNavigation {
  activeServerId: string | null;
  activeChannelId: string | null;
}

export class AppStore {
  private state: AppState;

  constructor(session: Session | null) {
    const persisted = this.loadNavigation();
    this.state = {
      session,
      servers: [],
      activeServerId: persisted.activeServerId,
      channels: [],
      activeChannelId: persisted.activeChannelId,
      messages: [],
      loading: {
        auth: false,
        servers: false,
        channels: false,
        messages: false,
        send: false,
      },
      authMode: "login",
      pendingCreate: "none",
      createName: "",
      createError: null,
      error: null,
      unreadByChannel: {},
    };
  }

  getState(): Readonly<AppState> {
    return this.state;
  }

  patch(next: Partial<AppState>): Readonly<AppState> {
    this.state = { ...this.state, ...next };
    this.persistNavigation();
    return this.state;
  }

  patchLoading(next: Partial<LoadingState>): Readonly<AppState> {
    this.state = {
      ...this.state,
      loading: {
        ...this.state.loading,
        ...next,
      },
    };
    return this.state;
  }

  private loadNavigation(): PersistedNavigation {
    const raw = globalThis.localStorage?.getItem(NAV_STORAGE_KEY);
    if (!raw) {
      return { activeServerId: null, activeChannelId: null };
    }

    try {
      const parsed = JSON.parse(raw) as PersistedNavigation;
      return {
        activeServerId: parsed.activeServerId ?? null,
        activeChannelId: parsed.activeChannelId ?? null,
      };
    } catch {
      return { activeServerId: null, activeChannelId: null };
    }
  }

  private persistNavigation(): void {
    const payload: PersistedNavigation = {
      activeServerId: this.state.activeServerId,
      activeChannelId: this.state.activeChannelId,
    };
    globalThis.localStorage?.setItem(NAV_STORAGE_KEY, JSON.stringify(payload));
  }
}
