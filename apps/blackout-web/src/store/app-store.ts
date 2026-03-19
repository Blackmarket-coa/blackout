import type { ChannelSummary, ChatMessage, ServerSummary, Session } from "../types";

const NAV_STORAGE_KEY = "blackout.web.navigation";

export interface AppState {
  session: Session | null;
  servers: ServerSummary[];
  activeServerId: string | null;
  channels: ChannelSummary[];
  activeChannelId: string | null;
  messages: ChatMessage[];
  pendingAuth: boolean;
  loadingWorkspace: boolean;
  authMode: "login" | "register";
  error: string | null;
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
      pendingAuth: false,
      loadingWorkspace: false,
      authMode: "login",
      error: null,
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

  resetWorkspace(): Readonly<AppState> {
    this.state = {
      ...this.state,
      servers: [],
      channels: [],
      messages: [],
      activeServerId: null,
      activeChannelId: null,
      loadingWorkspace: false,
      error: null,
    };
    this.persistNavigation();
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
