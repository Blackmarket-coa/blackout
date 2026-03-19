import type { RoomSummary, Session, TimelineEvent, UserSettings } from "../types";

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
      return { accessToken: "mock-token", userId: `@${username}:blackout.local` };
    }

    const payload = await this.fetchJson<{ access_token: string; user_id: string }>("/_matrix/client/v3/login", {
      method: "POST",
      body: JSON.stringify({
        type: "m.login.password",
        identifier: { type: "m.id.user", user: username },
        password,
      }),
      headers: { "content-type": "application/json" },
    });

    return { accessToken: payload.access_token, userId: payload.user_id };
  }

  async getRooms(session: Session): Promise<RoomSummary[]> {
    if (this.useMockApi) {
      return [
        { id: "!ops:blackout.local", name: "Ops" },
        { id: "!governance:blackout.local", name: "Governance" },
      ];
    }

    const payload = await this.fetchJson<{ joined_rooms: string[] }>("/_matrix/client/v3/joined_rooms", {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    return payload.joined_rooms.map((roomId) => ({ id: roomId, name: roomId }));
  }

  async getTimeline(session: Session, roomId: string): Promise<TimelineEvent[]> {
    if (this.useMockApi) {
      return [
        {
          id: "$1",
          sender: "@alice:blackout.local",
          body: `Welcome to ${roomId}`,
          timestamp: new Date().toISOString(),
        },
      ];
    }

    const payload = await this.fetchJson<{ chunk: Array<{ event_id: string; sender: string; origin_server_ts: number; content?: { body?: string } }> }>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=20`,
      { headers: { authorization: `Bearer ${session.accessToken}` } },
    );

    return payload.chunk.map((event) => ({
      id: event.event_id,
      sender: event.sender,
      body: event.content?.body ?? "(non-text event)",
      timestamp: new Date(event.origin_server_ts).toISOString(),
    }));
  }

  async getSettings(_session: Session): Promise<UserSettings> {
    if (this.useMockApi) return { theme: "dark", notifications: true };
    return { theme: "dark", notifications: true };
  }

  async saveSettings(_session: Session, settings: UserSettings): Promise<void> {
    if (this.useMockApi) return;
    await this.fetchJson("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
      headers: { "content-type": "application/json" },
    });
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
