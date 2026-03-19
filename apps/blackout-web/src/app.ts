import { ApiError, type GatewayEvent } from "./api/client";
import { renderChannelSidebar } from "./components/ChannelSidebar";
import { renderChatWindow } from "./components/ChatWindow";
import { renderServerSidebar } from "./components/ServerSidebar";
import { renderAuthView } from "./features/auth/auth-view";
import { createApiClient } from "./services/api";
import { MatrixGatewayClient } from "./services/matrix-client";
import { SessionStore } from "./session/store";
import { AppStore } from "./store/app-store";
import type { ServerDetails } from "./types";

export class BlackoutWebApp {
  private readonly root: HTMLElement;
  private readonly api = createApiClient();
  private readonly sessions = new SessionStore();
  private readonly matrixGateway = new MatrixGatewayClient();
  private readonly store = new AppStore(this.sessions.load());

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async mount(): Promise<void> {
    this.render();

    const state = this.store.getState();
    if (!state.session) return;

    this.connectGateway();
    await this.loadServers();
  }

  private render(): void {
    const state = this.store.getState();
    this.root.innerHTML = `
      <main class="container">
        <header class="header">
          <h1>Blackout Core</h1>
          <p class="meta">Discord-like starter shell on top of Matrix-compatible APIs.</p>
        </header>

        ${state.error ? `<p class="error" role="alert">${state.error}</p>` : ""}
        ${state.loadingWorkspace ? '<p class="loading">Syncing workspace…</p>' : ""}

        ${state.session ? this.renderWorkspace() : renderAuthView({ mode: state.authMode, busy: state.pendingAuth })}
      </main>
    `;

    this.bindEvents();
    this.scrollMessagesToBottom();
  }

  private renderWorkspace(): string {
    const state = this.store.getState();
    const selectedServer = state.servers.find((server) => server.id === state.activeServerId);

    return `
      <section class="workspace">
        ${renderServerSidebar({ servers: state.servers, activeServerId: state.activeServerId })}
        ${renderChannelSidebar({
          serverName: selectedServer?.name ?? "Channels",
          channels: state.channels,
          activeChannelId: state.activeChannelId,
        })}
        ${renderChatWindow({
          channelLabel: state.activeChannelId ? `#${state.channels.find((channel) => channel.id === state.activeChannelId)?.name ?? "channel"}` : "Pick a channel",
          messages: state.messages,
          canSend: Boolean(state.activeChannelId),
        })}
      </section>
    `;
  }

  private bindEvents(): void {
    this.root.querySelector<HTMLFormElement>("#auth-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleAuthSubmit(event.currentTarget as HTMLFormElement);
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='toggle-auth-mode']")?.addEventListener("click", () => {
      const nextMode = this.store.getState().authMode === "login" ? "register" : "login";
      this.store.patch({ authMode: nextMode, error: null });
      this.render();
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

    this.root.querySelector<HTMLButtonElement>("[data-action='create-server']")?.addEventListener("click", () => {
      void this.handleCreateServer();
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='create-channel']")?.addEventListener("click", () => {
      void this.handleCreateChannel();
    });

    this.root.querySelector<HTMLFormElement>("#message-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleSendMessage(event.currentTarget as HTMLFormElement);
    });
  }

  private async withUiHandling(work: () => Promise<void>, mode: "auth" | "workspace"): Promise<void> {
    if (mode === "auth") this.store.patch({ pendingAuth: true, error: null });
    else this.store.patch({ loadingWorkspace: true, error: null });

    this.render();

    try {
      await work();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Unexpected error.";
      this.store.patch({ error: message });
    } finally {
      if (mode === "auth") this.store.patch({ pendingAuth: false });
      else this.store.patch({ loadingWorkspace: false });
      this.render();
    }
  }

  private async handleAuthSubmit(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();
    const mode = this.store.getState().authMode;

    await this.withUiHandling(async () => {
      const session = mode === "login" ? await this.api.login(username, password) : await this.api.register(username, password);
      this.sessions.save(session);
      this.store.patch({ session, error: null });
      this.connectGateway();
      await this.loadServers();
    }, "auth");
  }

  private async loadServers(): Promise<void> {
    const state = this.store.getState();
    if (!state.session) return;

    await this.withUiHandling(async () => {
      const servers = await this.api.getServers(state.session!);
      const preferredServerId = state.activeServerId && servers.some((server) => server.id === state.activeServerId) ? state.activeServerId : servers[0]?.id ?? null;

      this.store.patch({
        servers,
        activeServerId: preferredServerId,
        channels: [],
        activeChannelId: null,
        messages: [],
      });

      if (preferredServerId) {
        await this.openServer(preferredServerId);
      }
    }, "workspace");
  }

  private async openServer(serverId: string): Promise<void> {
    const state = this.store.getState();
    if (!state.session) return;

    await this.withUiHandling(async () => {
      const details: ServerDetails = await this.api.getServerDetails(state.session!, serverId);
      const preferredChannelId = state.activeChannelId && details.channels.some((channel) => channel.id === state.activeChannelId) ? state.activeChannelId : details.channels[0]?.id ?? null;

      this.store.patch({
        activeServerId: serverId,
        channels: details.channels,
        activeChannelId: preferredChannelId,
        messages: [],
      });

      if (preferredChannelId) {
        await this.openChannel(preferredChannelId);
      }
    }, "workspace");
  }

  private async openChannel(channelId: string): Promise<void> {
    const state = this.store.getState();
    if (!state.session) return;

    await this.withUiHandling(async () => {
      const messages = await this.api.getMessages(state.session!, channelId);
      this.store.patch({ activeChannelId: channelId, messages });
    }, "workspace");
  }

  private async handleCreateServer(): Promise<void> {
    const state = this.store.getState();
    if (!state.session) return;

    const name = globalThis.prompt("New server name");
    if (!name?.trim()) return;

    await this.withUiHandling(async () => {
      const server = await this.api.createServer(state.session!, name.trim());
      this.store.patch({ servers: [...this.store.getState().servers, server] });
      await this.openServer(server.id);
    }, "workspace");
  }

  private async handleCreateChannel(): Promise<void> {
    const state = this.store.getState();
    if (!state.session || !state.activeServerId) return;

    const name = globalThis.prompt("New channel name");
    if (!name?.trim()) return;

    await this.withUiHandling(async () => {
      const channel = await this.api.createChannel(state.session!, state.activeServerId!, name.trim());
      this.store.patch({ channels: [...this.store.getState().channels, channel] });
      await this.openChannel(channel.id);
    }, "workspace");
  }

  private async handleSendMessage(form: HTMLFormElement): Promise<void> {
    const state = this.store.getState();
    if (!state.session || !state.activeChannelId) return;

    const formData = new FormData(form);
    const body = String(formData.get("message") ?? "").trim();
    if (!body) return;

    await this.withUiHandling(async () => {
      const message = await this.api.sendMessage(state.session!, state.activeChannelId!, body);
      this.store.patch({ messages: [...this.store.getState().messages, message] });
      form.reset();
    }, "workspace");
  }

  private connectGateway(): void {
    const state = this.store.getState();
    if (!state.session) return;

    this.matrixGateway.connect(this.api, state.session, (event) => {
      this.handleGatewayEvent(event);
    });
  }

  private handleGatewayEvent(event: GatewayEvent): void {
    const state = this.store.getState();
    if (event.type !== "message.created" || !event.message || event.channelId !== state.activeChannelId) return;

    this.store.patch({ messages: [...state.messages, event.message] });
    this.render();
  }

  private scrollMessagesToBottom(): void {
    const messageList = this.root.querySelector<HTMLElement>(".message-list");
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }
}
