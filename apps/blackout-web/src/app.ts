import { ApiError, type GatewayEvent } from "./api/client";
import { renderChannelSidebar } from "./components/ChannelSidebar";
import { renderChatWindow } from "./components/ChatWindow";
import { renderCreateEntityModal } from "./components/CreateEntityModal";
import { renderServerSidebar } from "./components/ServerSidebar";
import { renderAuthView } from "./features/auth/auth-view";
import { createApiClient } from "./services/api";
import { MatrixGatewayClient } from "./services/matrix-client";
import { SessionStore } from "./session/store";
import { AppStore, type PendingCreate } from "./store/app-store";
import type { ChatMessage, ServerDetails } from "./types";

const NAME_PATTERN = /^[a-zA-Z0-9 _-]{2,40}$/;

export class BlackoutWebApp {
  private readonly root: HTMLElement;
  private readonly api = createApiClient();
  private readonly sessions = new SessionStore();
  private readonly matrixGateway = new MatrixGatewayClient();
  private readonly store = new AppStore(this.sessions.load());
  private readonly seenEventIds = new Set<string>();

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
    const loading = state.loading;
    const modalMode = state.pendingCreate;

    this.root.innerHTML = `
      <main class="container">
        <header class="header">
          <h1>Blackout Core</h1>
          <p class="meta">Discord-like starter shell on top of Matrix-compatible APIs.</p>
        </header>

        ${state.error ? `<p class="error" role="alert">${state.error}</p>` : ""}
        ${loading.servers || loading.channels || loading.messages ? '<p class="loading">Syncing workspace…</p>' : ""}

        ${state.session ? this.renderWorkspace() : renderAuthView({ mode: state.authMode, busy: loading.auth })}
      </main>
      ${modalMode !== "none" ? renderCreateEntityModal({ mode: modalMode, value: state.createName, error: state.createError, busy: loading.channels || loading.servers }) : ""}
    `;

    this.bindEvents();
    this.scrollMessagesToBottom();
  }

  private renderWorkspace(): string {
    const state = this.store.getState();
    const selectedServer = state.servers.find((server) => server.id === state.activeServerId);

    return `
      <section class="workspace ${state.channelDrawerOpen ? "show-channel-drawer" : ""}">
        ${renderServerSidebar({ servers: state.servers, activeServerId: state.activeServerId })}
        ${renderChannelSidebar({
          serverName: selectedServer?.name ?? "Channels",
          channels: state.channels,
          activeChannelId: state.activeChannelId,
          unreadByChannel: state.unreadByChannel,
        })}
        ${renderChatWindow({
          channelLabel: state.activeChannelId ? `#${state.channels.find((channel) => channel.id === state.activeChannelId)?.name ?? "channel"}` : "Pick a channel",
          messages: state.messages,
          canSend: Boolean(state.activeChannelId),
          sendPending: state.loading.send,
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
        this.store.patch({ channelDrawerOpen: false });
        this.render();
      });
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='create-server']")?.addEventListener("click", () => {
      this.openCreateModal("server");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='create-channel']")?.addEventListener("click", () => {
      this.openCreateModal("channel");
    });

    this.root.querySelector<HTMLButtonElement>("[data-action='cancel-create']")?.addEventListener("click", () => {
      this.closeCreateModal();
    });

    this.root.querySelector<HTMLFormElement>("#create-entity-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submitCreateEntity(event.currentTarget as HTMLFormElement);
    });


    this.root.querySelector<HTMLButtonElement>("[data-action='toggle-channel-drawer']")?.addEventListener("click", () => {
      const current = this.store.getState().channelDrawerOpen;
      this.store.patch({ channelDrawerOpen: !current });
      this.render();
    });

    this.root.querySelector<HTMLFormElement>("#message-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.handleSendMessage(event.currentTarget as HTMLFormElement);
    });


    this.root.querySelector<HTMLTextAreaElement>("#message-form textarea[name='message']")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const form = (event.currentTarget as HTMLTextAreaElement).form;
        form?.requestSubmit();
      }
    });
  }

  private async withLoading<T extends keyof ReturnType<AppStore["getState"]>["loading"]>(
    key: T,
    work: () => Promise<void>,
    onError: (message: string) => void = (message) => {
      this.store.patch({ error: message });
    },
  ): Promise<void> {
    this.store.patchLoading({ [key]: true });
    this.render();

    try {
      await work();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Unexpected error.";
      onError(message);
    } finally {
      this.store.patchLoading({ [key]: false });
      this.render();
    }
  }

  private async handleAuthSubmit(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();
    const mode = this.store.getState().authMode;

    await this.withLoading("auth", async () => {
      const session = mode === "login" ? await this.api.login(username, password) : await this.api.register(username, password);
      this.sessions.save(session);
      this.store.patch({ session, error: null });
      this.connectGateway();
      await this.loadServers();
    });
  }

  private async loadServers(): Promise<void> {
    const state = this.store.getState();
    const session = state.session;
    if (!session) return;

    await this.withLoading("servers", async () => {
      const servers = await this.api.getServers(session);
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
    });
  }

  private async openServer(serverId: string): Promise<void> {
    const state = this.store.getState();
    if (!state.session) return;

    await this.withLoading("channels", async () => {
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
    });
  }

  private async openChannel(channelId: string): Promise<void> {
    const state = this.store.getState();
    if (!state.session) return;

    await this.withLoading("messages", async () => {
      const messages = this.sortMessages(await this.api.getMessages(state.session!, channelId));
      const current = this.store.getState();
      this.store.patch({
        activeChannelId: channelId,
        messages,
        unreadByChannel: {
          ...current.unreadByChannel,
          [channelId]: 0,
        },
      });
      this.markSeen(messages);
    });
  }

  private openCreateModal(mode: Exclude<PendingCreate, "none">): void {
    if (mode === "channel" && !this.store.getState().activeServerId) {
      this.store.patch({ error: "Pick a server before creating a channel." });
      this.render();
      return;
    }

    this.store.patch({ pendingCreate: mode, createError: null, createName: "" });
    this.render();
  }

  private closeCreateModal(): void {
    this.store.patch({ pendingCreate: "none", createError: null, createName: "" });
    this.render();
  }

  private async submitCreateEntity(form: HTMLFormElement): Promise<void> {
    const state = this.store.getState();
    if (!state.session || state.pendingCreate === "none") return;

    const name = String(new FormData(form).get("name") ?? "").trim();
    this.store.patch({ createName: name });

    const validationError = this.validateName(name);
    if (validationError) {
      this.store.patch({ createError: validationError });
      this.render();
      return;
    }

    const key = state.pendingCreate === "server" ? "servers" : "channels";

    await this.withLoading(
      key,
      async () => {
        const current = this.store.getState();
        if (current.pendingCreate === "server") {
          const server = await this.api.createServer(current.session!, name);
          this.store.patch({
            servers: [...current.servers, server],
            pendingCreate: "none",
            createError: null,
            createName: "",
          });
          await this.openServer(server.id);
          return;
        }

        if (!current.activeServerId) {
          throw new ApiError("No active server selected.", 400, "VALIDATION_ERROR");
        }

        const channel = await this.api.createChannel(current.session!, current.activeServerId, name);
        this.store.patch({
          channels: [...current.channels, channel],
          pendingCreate: "none",
          createError: null,
          createName: "",
        });
        await this.openChannel(channel.id);
      },
      (message) => {
        this.store.patch({ createError: message });
      },
    );
  }

  private validateName(name: string): string | null {
    if (!name) return "Name is required.";
    if (!NAME_PATTERN.test(name)) return "Use 2-40 chars: letters, numbers, spaces, _ or -.";
    return null;
  }

  private async handleSendMessage(form: HTMLFormElement): Promise<void> {
    const state = this.store.getState();
    if (!state.session || !state.activeChannelId) return;

    const formData = new FormData(form);
    const body = String(formData.get("message") ?? "").trim();
    if (!body) return;

    const optimisticMessage: ChatMessage = {
      id: `tmp_${Date.now()}`,
      sender: state.session.user.username,
      body,
      timestamp: new Date().toISOString(),
    };

    this.appendMessage(optimisticMessage);
    form.reset();

    await this.withLoading(
      "send",
      async () => {
        const delivered = await this.api.sendMessage(state.session!, state.activeChannelId!, body);
        const current = this.store.getState();
        const withoutOptimistic = current.messages.filter((message) => message.id !== optimisticMessage.id);
        this.store.patch({ messages: this.sortMessages([...withoutOptimistic, delivered]), error: null });
      },
      () => {
        const current = this.store.getState();
        this.store.patch({
          messages: current.messages.filter((message) => message.id !== optimisticMessage.id),
          error: "Message failed to send.",
        });
      },
    );
  }

  private connectGateway(): void {
    const state = this.store.getState();
    if (!state.session) return;

    this.matrixGateway.connect(this.api, state.session, {
      onEvent: (event) => {
        this.handleGatewayEvent(event);
      },
      onReconnect: () => {
        void this.recoverAfterReconnect();
      },
    });
  }

  private handleGatewayEvent(event: GatewayEvent): void {
    if (typeof event.eventId === "string") {
      if (this.seenEventIds.has(event.eventId)) return;
      this.seenEventIds.add(event.eventId);
    }

    if (event.type !== "message.created" || !event.message || !event.channelId) return;

    const state = this.store.getState();
    if (event.channelId === state.activeChannelId) {
      this.appendMessage(event.message);
      return;
    }

    this.store.patch({
      unreadByChannel: {
        ...state.unreadByChannel,
        [event.channelId]: (state.unreadByChannel[event.channelId] ?? 0) + 1,
      },
    });
    this.render();
  }

  private async recoverAfterReconnect(): Promise<void> {
    const state = this.store.getState();
    if (!state.session || !state.activeChannelId) return;

    await this.withLoading("messages", async () => {
      const messages = this.sortMessages(await this.api.getMessages(state.session!, state.activeChannelId!));
      this.store.patch({ messages });
      this.markSeen(messages);
    });
  }

  private appendMessage(message: ChatMessage): void {
    const state = this.store.getState();
    if (state.messages.some((entry) => entry.id === message.id)) return;

    this.store.patch({ messages: this.sortMessages([...state.messages, message]) });
    this.markSeen([message]);
    this.render();
  }

  private sortMessages(messages: ChatMessage[]): ChatMessage[] {
    return [...messages].sort((a, b) => {
      const timeA = Date.parse(a.timestamp);
      const timeB = Date.parse(b.timestamp);
      if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
        return a.id.localeCompare(b.id);
      }
      if (timeA === timeB) {
        return a.id.localeCompare(b.id);
      }
      return timeA - timeB;
    });
  }

  private markSeen(messages: ChatMessage[]): void {
    for (const message of messages) {
      this.seenEventIds.add(message.id);
    }
  }

  private scrollMessagesToBottom(): void {
    const messageList = this.root.querySelector<HTMLElement>(".message-list");
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }
}
