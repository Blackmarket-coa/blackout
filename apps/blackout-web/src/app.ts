import { ApiClient, ApiError, type GatewayEvent } from "./api/client";
import { blackoutWebConfig } from "./index";
import { SessionStore } from "./session/store";
import type { ChannelSummary, ChatMessage, ServerDetails, ServerSummary, Session } from "./types";

interface AppState {
  session: Session | null;
  servers: ServerSummary[];
  activeServerId: string | null;
  channels: ChannelSummary[];
  activeChannelId: string | null;
  messages: ChatMessage[];
  error: string | null;
  loading: boolean;
}

export class BlackoutWebApp {
  private readonly root: HTMLElement;
  private readonly api: ApiClient;
  private readonly sessions: SessionStore;
  private gatewaySocket: WebSocket | null = null;
  private state: AppState;

  constructor(root: HTMLElement) {
    this.root = root;
    this.sessions = new SessionStore();
    this.api = new ApiClient({
      baseUrl: blackoutWebConfig.homeserverUrl,
      useMockApi: import.meta.env.VITE_USE_MOCK_API !== "false",
    });

    this.state = {
      session: this.sessions.load(),
      servers: [],
      activeServerId: null,
      channels: [],
      activeChannelId: null,
      messages: [],
      error: null,
      loading: false,
    };
  }

  async mount(): Promise<void> {
    this.render();
    if (this.state.session) {
      this.connectGateway();
      await this.loadServers();
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
          <p class="meta">API: <code>${blackoutWebConfig.homeserverUrl}</code></p>
        </header>
        ${this.state.error ? `<p class="error" role="alert">${this.state.error}</p>` : ""}
        ${this.state.loading ? `<p class="loading">Loading…</p>` : ""}
        ${this.state.session ? this.renderWorkspace() : this.renderAuth()}
      </main>
    `;

    this.bindEvents();
  }

  private renderAuth(): string {
    return `
      <form id="auth-form" class="stack auth-card">
        <h2>Sign in</h2>
        <label>Username <input required name="username" autocomplete="username" /></label>
        <label>Password <input required name="password" type="password" autocomplete="current-password" /></label>
        <button type="submit">Sign in</button>
      </form>
    `;
  }

  private renderWorkspace(): string {
    const selectedServerName = this.state.servers.find((server) => server.id === this.state.activeServerId)?.name ?? "Select a server";

    return `
      <section class="workspace">
        <aside class="server-sidebar">
          <div class="sidebar-head">Servers</div>
          <ul>
            ${this.state.servers
              .map(
                (server) =>
                  `<li><button type="button" class="sidebar-btn ${server.id === this.state.activeServerId ? "is-selected" : ""}" data-action="open-server" data-server-id="${server.id}">${server.name}</button></li>`,
              )
              .join("")}
          </ul>
        </aside>

        <aside class="channel-list">
          <div class="sidebar-head">${selectedServerName}</div>
          <ul>
            ${this.state.channels
              .map(
                (channel) =>
                  `<li><button type="button" class="sidebar-btn ${channel.id === this.state.activeChannelId ? "is-selected" : ""}" data-action="open-channel" data-channel-id="${channel.id}"># ${channel.name}</button></li>`,
              )
              .join("")}
          </ul>
        </aside>

        <section class="chat-window">
          <div class="chat-head">${this.state.activeChannelId ? `Channel: ${this.state.activeChannelId}` : "Pick a channel"}</div>
          <ul class="message-list">
            ${this.state.messages.map((message) => `<li><strong>${message.sender}</strong><p>${message.body}</p></li>`).join("")}
          </ul>
          <form id="message-form" class="chat-input">
            <input name="message" placeholder="Send a message" ${this.state.activeChannelId ? "" : "disabled"} />
            <button type="submit" ${this.state.activeChannelId ? "" : "disabled"}>Send</button>
          </form>
        </section>
      </section>
    `;
  }

  private bindEvents(): void {
    this.root.querySelector<HTMLFormElement>("#auth-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleLogin(event.currentTarget as HTMLFormElement);
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-server']").forEach((button) => {
      button.addEventListener("click", () => {
        const serverId = button.dataset.serverId;
        if (!serverId) return;
        void this.openServer(serverId);
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='open-channel']").forEach((button) => {
      button.addEventListener("click", () => {
        const channelId = button.dataset.channelId;
        if (!channelId) return;
        void this.openChannel(channelId);
      });
    });

    this.root.querySelector<HTMLFormElement>("#message-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleSendMessage(event.currentTarget as HTMLFormElement);
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
      this.setState({ session });
      this.connectGateway();
      await this.loadServers();
    });
  }

  private async loadServers(): Promise<void> {
    if (!this.state.session) return;

    await this.runWithHandling(async () => {
      const servers = await this.api.getServers(this.state.session!);
      const activeServerId = servers[0]?.id ?? null;
      this.setState({ servers, activeServerId, channels: [], activeChannelId: null, messages: [] });
      if (activeServerId) await this.openServer(activeServerId);
    });
  }

  private async openServer(serverId: string): Promise<void> {
    if (!this.state.session) return;

    await this.runWithHandling(async () => {
      const details: ServerDetails = await this.api.getServerDetails(this.state.session!, serverId);
      const activeChannelId = details.channels[0]?.id ?? null;
      this.setState({
        activeServerId: serverId,
        channels: details.channels,
        activeChannelId,
        messages: [],
      });
      if (activeChannelId) await this.openChannel(activeChannelId);
    });
  }

  private async openChannel(channelId: string): Promise<void> {
    if (!this.state.session) return;

    await this.runWithHandling(async () => {
      const messages = await this.api.getMessages(this.state.session!, channelId);
      this.setState({ activeChannelId: channelId, messages });
    });
  }

  private async handleSendMessage(form: HTMLFormElement): Promise<void> {
    if (!this.state.session || !this.state.activeChannelId) return;

    const formData = new FormData(form);
    const body = String(formData.get("message") ?? "").trim();
    if (!body) return;

    await this.runWithHandling(async () => {
      const message = await this.api.sendMessage(this.state.session!, this.state.activeChannelId!, body);
      this.setState({ messages: [...this.state.messages, message] });
      form.reset();
    });
  }

  private connectGateway(): void {
    if (!this.state.session) return;
    this.gatewaySocket?.close();
    this.gatewaySocket = this.api.connectGateway(this.state.session, (event) => this.handleGatewayEvent(event));
  }

  private handleGatewayEvent(event: GatewayEvent): void {
    if (event.type !== "message.created" || !event.message || event.channelId !== this.state.activeChannelId) return;
    this.setState({ messages: [...this.state.messages, event.message] });
  }
}
