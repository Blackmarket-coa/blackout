import { describe, expect, it, vi } from "vitest";

import { ApiClient, ApiError } from "../../src/api/client";

describe("ApiClient", () => {
  it("returns mocked servers when mock api is enabled", async () => {
    const client = new ApiClient({ baseUrl: "https://api.example", useMockApi: true });
    const servers = await client.getServers({ jwt: "x", user: { id: "u1", username: "alice" } });
    expect(servers).toHaveLength(2);
  });

  it("calls /v1/auth/login endpoint", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: "jwt", user: { id: "u1", username: "alice" } }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const client = new ApiClient({ baseUrl: "https://api.example", useMockApi: false });
    await client.login("alice", "secret");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example/v1/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws ApiError for failing network request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Invalid token" }),
      }),
    );

    const client = new ApiClient({ baseUrl: "https://api.example", useMockApi: false });
    await expect(client.getServers({ jwt: "bad", user: { id: "u1", username: "alice" } })).rejects.toBeInstanceOf(ApiError);
  });
});
