import { ApiClient, ApiError } from "./api/client";
import { blackoutWebConfig } from "./index";
import { SessionStore } from "./session/store";
import type { AppScreen, RoomSummary, Session, TimelineEvent, UserSettings } from "./types";

interface AppState {
  screen: AppScreen;
  session: Session | null;
  rooms: RoomSummary[];
  selectedRoomId: string | null;
  timeline: TimelineEvent[];
  settings: UserSettings | null;
  error: string | null;
  loading: boolean;
}

export class BlackoutWebApp {
  private readonly root: HTMLElement;
  private readonly api: ApiClient;
  private readonly sessions: SessionStore;
  private state: AppState;

  constructor(root: HTMLElement) {
    this.root = root;
    this.sessions = new SessionStore();
    this.api = new ApiClient({
      baseUrl: blackoutWebConfig.homeserverUrl,
      useMockApi: import.meta.env.VITE_USE_MOCK_API !== "false",
    });

    const persistedSession = this.sessions.load();
    this.state = {
      screen: persistedSession ? "rooms" : "auth",
      session: persistedSession,
      rooms: [],
      selectedRoomId: null,
      timeline: [],
      settings: null,
      error: null,
      loading: false,
    };
  }

  async mount(): Promise<void> {
    this.render();
    if (this.state.session) {
      await this.loadRooms();
    }
  }

  private setState(next: Partial<AppState>): void {
    this.state = { ...this.state, ...next };
    this.render();
  }

  private render(): void {
    this.root.innerHTML = `
      <main class="container">
        <header class="header">
          <h1>Blackout Frontend</h1>
          <p class="meta">Homeserver: <code>${blackoutWebConfig.homeserverUrl}</code></p>
          <nav class="tabs">
            ${this.tabButton("auth", "Auth")}
            ${this.tabButton("rooms", "Rooms")}
            ${this.tabButton("timeline", "Timeline")}
            ${this.tabButton("settings", "Settings")}
          </nav>
        </header>
        ${this.state.error ? `<p class="error" role="alert">${this.state.error}</p>` : ""}
        ${this.state.loading ? `<p class="loading">Loading…</p>` : ""}
        <section class="screen">${this.renderScreen()}</section>
      </main>
    `;

    this.bindEvents();
  }

  private tabButton(screen: AppScreen, label: string): string {
    const active = this.state.screen === screen ? "is-active" : "";
    return `<button data-action="switch-screen" data-screen="${screen}" class="tab ${active}" type="button">${label}</button>`;
  }

  private renderScreen(): string {
    switch (this.state.screen) {
      case "auth":
        return `
          <form id="auth-form" class="stack">
            <label>Username <input required name="username" autocomplete="username" /></label>
            <label>Password <input required name="password" type="password" autocomplete="current-password" /></label>
            <button type="submit">Sign in</button>
          </form>
        `;
      case "rooms":
        return `
          <div class="stack">
            <button data-action="refresh-rooms" type="button">Refresh rooms</button>
            <ul>
              ${this.state.rooms.map((room) => `<li><button type="button" data-action="open-room" data-room-id="${room.id}">${room.name}</button></li>`).join("")}
            </ul>
          </div>
        `;
      case "timeline":
        return `
          <div class="stack">
            <p>Room: ${this.state.selectedRoomId ?? "(none selected)"}</p>
            <ul>
              ${this.state.timeline.map((event) => `<li><strong>${event.sender}</strong>: ${event.body}</li>`).join("")}
            </ul>
          </div>
        `;
      case "settings":
        return `
          <form id="settings-form" class="stack">
            <label>
              Theme
              <select name="theme">
                <option value="dark" ${this.state.settings?.theme === "dark" ? "selected" : ""}>Dark</option>
                <option value="light" ${this.state.settings?.theme === "light" ? "selected" : ""}>Light</option>
              </select>
            </label>
            <label class="checkbox">
              <input type="checkbox" name="notifications" ${this.state.settings?.notifications ? "checked" : ""} />
              Enable notifications
            </label>
            <button type="submit">Save settings</button>
          </form>
        `;
      default:
        return "<p>Unknown screen.</p>";
    }
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='switch-screen']").forEach((button) => {
      button.addEventListener("click", async () => {
        const screen = button.dataset.screen as AppScreen;
        this.setState({ screen, error: null });
        if (screen === "rooms") await this.loadRooms();
        if (screen === "settings") await this.loadSettings();
      });
    });

    this.root.querySelector<HTMLFormElement>("#auth-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleLogin(event.currentTarget as HTMLFormElement);
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='refresh-rooms']")?.addEventListener("click", () => {
      void this.loadRooms();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-room']").forEach((button) => {
      button.addEventListener("click", () => {
        const roomId = button.dataset.roomId;
        if (!roomId) return;
        void this.openRoom(roomId);
      });
    });

    this.root.querySelector<HTMLFormElement>("#settings-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleSaveSettings(event.currentTarget as HTMLFormElement);
    });
  }

  private async runWithHandling(work: () => Promise<void>): Promise<void> {
    this.setState({ loading: true, error: null });
    try {
      await work();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Unexpected error";
      this.setState({ error: message });
    } finally {
      this.setState({ loading: false });
    }
  }

  private async handleLogin(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    await this.runWithHandling(async () => {
      const session = await this.api.login(username, password);
      this.sessions.save(session);
      this.setState({ session, screen: "rooms" });
      await this.loadRooms();
    });
  }

  private async loadRooms(): Promise<void> {
    if (!this.state.session) {
      this.setState({ screen: "auth", rooms: [], timeline: [] });
      return;
    }

    await this.runWithHandling(async () => {
      const rooms = await this.api.getRooms(this.state.session!);
      this.setState({ rooms, screen: "rooms" });
    });
  }

  private async openRoom(roomId: string): Promise<void> {
    if (!this.state.session) return;

    await this.runWithHandling(async () => {
      const timeline = await this.api.getTimeline(this.state.session!, roomId);
      this.setState({ selectedRoomId: roomId, timeline, screen: "timeline" });
    });
  }

  private async loadSettings(): Promise<void> {
    if (!this.state.session) return;

    await this.runWithHandling(async () => {
      const settings = await this.api.getSettings(this.state.session!);
      this.setState({ settings, screen: "settings" });
    });
  }

  private async handleSaveSettings(form: HTMLFormElement): Promise<void> {
    if (!this.state.session) return;
    const formData = new FormData(form);
    const settings: UserSettings = {
      theme: String(formData.get("theme")) === "light" ? "light" : "dark",
      notifications: formData.get("notifications") === "on",
    };

    await this.runWithHandling(async () => {
      await this.api.saveSettings(this.state.session!, settings);
      this.setState({ settings });
    });
  }
}
