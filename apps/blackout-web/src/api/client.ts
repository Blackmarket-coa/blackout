import type {
  ApiErrorEnvelope,
  AuthRequest,
  AuthResponse,
  CreateChannelRequest,
  CreateChannelResponse,
  CreateServerRequest,
  CreateServerResponse,
  MessageListResponse,
  PushTokenMutationResponse,
  PushTokenRegisterRequest,
  PushTokenUnregisterRequest,
  RealtimeGatewayEvent,
  SendMessageRequest,
  SendMessageResponse,
  ServerDetailsResponse,
  ServerListResponse,
} from "../contracts/api-contract";
import { API_ROOTS } from "@blackout/contracts";
import type { ChannelSummary, ChatMessage, ServerDetails, ServerSummary, Session } from "../types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string | number | boolean | null>;

  constructor(message: string, status = 500, code = "UNKNOWN", details?: Record<string, string | number | boolean | null>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  useMockApi?: boolean;
}

export type GatewayEvent = RealtimeGatewayEvent;

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
      if (!username || !password) throw new ApiError("Username and password are required.", 400, "VALIDATION_ERROR");
      return {
        jwt: "mock-jwt-token",
        user: { id: "usr_mock", username },
      };
    }

    const payload = await this.fetchJson<AuthResponse>(`${API_ROOTS.v1}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username, password } satisfies AuthRequest),
      headers: { "content-type": "application/json" },
    });

    return { jwt: payload.token, user: payload.user };
  }

  async register(username: string, password: string): Promise<Session> {
    if (this.useMockApi) {
      return this.login(username, password);
    }

    const payload = await this.fetchJson<AuthResponse>(`${API_ROOTS.v1}/auth/register`, {
      method: "POST",
      body: JSON.stringify({ username, password } satisfies AuthRequest),
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

    return this.fetchJson<ServerListResponse>(`${API_ROOTS.v1}/servers`, {
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
          { id: "chn_governance", name: "governance-council", capabilityTags: ["governance"] },
          { id: "chn_standup", name: "standup" },
        ],
      };
    }

    return this.fetchJson<ServerDetailsResponse>(`${API_ROOTS.v1}/servers/${encodeURIComponent(serverId)}`, {
      headers: { authorization: `Bearer ${session.jwt}` },
    });
  }

  async createServer(session: Session, name: string): Promise<ServerSummary> {
    if (this.useMockApi) {
      return { id: `srv_${Date.now()}`, name, role: "owner" };
    }

    return this.fetchJson<CreateServerResponse>(`${API_ROOTS.v1}/servers`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name } satisfies CreateServerRequest),
    });
  }

  async createChannel(session: Session, serverId: string, name: string): Promise<ChannelSummary> {
    if (this.useMockApi) {
      return { id: `chn_${Date.now()}`, name };
    }

    return this.fetchJson<CreateChannelResponse>(`${API_ROOTS.v1}/servers/${encodeURIComponent(serverId)}/channels`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name } satisfies CreateChannelRequest),
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

    const payload = await this.fetchJson<MessageListResponse>(`${API_ROOTS.v1}/channels/${encodeURIComponent(channelId)}/messages`, {
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

    return this.fetchJson<SendMessageResponse>(`${API_ROOTS.v1}/channels/${encodeURIComponent(channelId)}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ body } satisfies SendMessageRequest),
    });
  }

  async registerDevicePushToken(session: Session, token: string, platform: "ios" | "android" | "web"): Promise<void> {
    if (this.useMockApi) return;

    await this.fetchJson<PushTokenMutationResponse>(`${API_ROOTS.v1}/mobile/push-tokens`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token, platform } satisfies PushTokenRegisterRequest),
    });
  }

  async unregisterDevicePushToken(session: Session, token: string): Promise<void> {
    if (this.useMockApi) return;

    await this.fetchJson<PushTokenMutationResponse>(`${API_ROOTS.v1}/mobile/push-tokens`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${session.jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token } satisfies PushTokenUnregisterRequest),
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
      const envelope = this.readErrorEnvelope(body);
      throw new ApiError(
        envelope?.message ?? `Request failed (${response.status})`,
        response.status,
        envelope?.code ?? "HTTP_ERROR",
        envelope?.details,
      );
    }

    return (await parseJsonSafe(response)) as T;
  }

  private readErrorEnvelope(payload: unknown): ApiErrorEnvelope | null {
    if (!payload || typeof payload !== "object") return null;

    const maybe = payload as Partial<ApiErrorEnvelope>;
    if (typeof maybe.message !== "string") return null;

    return {
      code: typeof maybe.code === "string" ? maybe.code : "HTTP_ERROR",
      message: maybe.message,
      details: maybe.details,
    };
  }
}
