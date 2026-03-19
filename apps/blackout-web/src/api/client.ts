import type { ChannelSummary, ChatMessage, ServerDetails, ServerSummary, Session } from "../types";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  useMockApi?: boolean;
}

export interface GatewayEvent {
  type: string;
  channelId?: string;
  message?: ChatMessage;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly useMockApi: boolean;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.useMockApi = options.useMockApi ?? false;
  }

  async login(username: string, password: string): Promise<Session> {
    if (this.useMockApi) {
      if (!username || !password) throw new ApiError("Username and password are required.", 400);
      return {
        jwt: "mock-jwt-token",
        user: { id: "usr_mock", username },
      };
    }

    const payload = await this.fetchJson<{ token: string; user: { id: string; username: string } }>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      headers: { "content-type": "application/json" },
    });

    return { jwt: payload.token, user: payload.user };
  }


  async register(username: string, password: string): Promise<Session> {
    if (this.useMockApi) {
      return this.login(username, password);
    }

    const payload = await this.fetchJson<{ token: string; user: { id: string; username: string } }>("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      headers: { "content-type": "application/json" },
    });

    return { jwt: payload.token, user: payload.user };
  }

  async getServers(session: Session): Promise<ServerSummary[]> {
    if (this.useMockApi) {
      return [
        { id: "srv_alpha", name: "Alpha Ops", role: "owner" },
        { id: "srv_beta", name: "Beta Crew", role: "member" },
      ];
    }

    return this.fetchJson<ServerSummary[]>("/v1/servers", {
      headers: { authorization: `Bearer ${session.jwt}` },
    });
  }

  async getServerDetails(session: Session, serverId: string): Promise<ServerDetails> {
    if (this.useMockApi) {
      return {
        id: serverId,
        name: serverId === "srv_alpha" ? "Alpha Ops" : "Beta Crew",
        channels: [
          { id: "chn_general", name: "general" },
          { id: "chn_standup", name: "standup" },
        ],
      };
    }

    return this.fetchJson<ServerDetails>(`/v1/servers/${encodeURIComponent(serverId)}`, {
      headers: { authorization: `Bearer ${session.jwt}` },
    });
  }


  async createServer(session: Session, name: string): Promise<ServerSummary> {
    if (this.useMockApi) {
      return { id: `srv_${Date.now()}`, name, role: "owner" };
    }

    return this.fetchJson<ServerSummary>("/v1/servers", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
  }

  async createChannel(session: Session, serverId: string, name: string): Promise<ChannelSummary> {
    if (this.useMockApi) {
      return { id: `chn_${Date.now()}`, name };
    }

    return this.fetchJson<ChannelSummary>(`/v1/servers/${encodeURIComponent(serverId)}/channels`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
  }

  async getMessages(session: Session, channelId: string): Promise<ChatMessage[]> {
    if (this.useMockApi) {
      return [
        {
          id: "msg1",
          sender: "alice",
          body: `Welcome to ${channelId}`,
          timestamp: new Date().toISOString(),
        },
      ];
    }

    const payload = await this.fetchJson<{ data: ChatMessage[] }>(`/v1/channels/${encodeURIComponent(channelId)}/messages`, {
      headers: { authorization: `Bearer ${session.jwt}` },
    });

    return payload.data;
  }

  async sendMessage(session: Session, channelId: string, body: string): Promise<ChatMessage> {
    if (this.useMockApi) {
      return {
        id: `msg_${Date.now()}`,
        sender: session.user.username,
        body,
        timestamp: new Date().toISOString(),
      };
    }

    return this.fetchJson<ChatMessage>(`/v1/channels/${encodeURIComponent(channelId)}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ body }),
    });
  }

  connectGateway(session: Session, onEvent: (event: GatewayEvent) => void): WebSocket | null {
    if (this.useMockApi || typeof WebSocket === "undefined") return null;

    const gatewayUrl = this.baseUrl.replace(/^http/i, "ws") + "/gateway";
    const socket = new WebSocket(gatewayUrl, ["blackout.jwt", session.jwt]);

    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(String(event.data)) as GatewayEvent;
        onEvent(data);
      } catch {
        // Ignore malformed gateway payloads.
      }
    });

    return socket;
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      const body = await parseJsonSafe(response);
      const message =
        (body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : undefined) ?? `Request failed (${response.status})`;
      throw new ApiError(message, response.status);
    }

    return (await parseJsonSafe(response)) as T;
  }
}
