import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient, ApiError } from "../../src/api/client";

describe("ApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("maps backend error envelope fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ code: "INVALID_NAME", message: "Bad name", details: { min: 2 } }),
      }),
    );

    const client = new ApiClient({ baseUrl: "https://api.example", useMockApi: false });

    await expect(client.createServer({ jwt: "x", user: { id: "u", username: "alice" } }, "x")).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      code: "INVALID_NAME",
      details: { min: 2 },
      message: "Bad name",
    } satisfies Partial<ApiError>);
  });

  it("falls back to generic code/message when envelope is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "legacy" }),
      }),
    );

    const client = new ApiClient({ baseUrl: "https://api.example", useMockApi: false });
    await expect(client.getServers({ jwt: "bad", user: { id: "u1", username: "alice" } })).rejects.toMatchObject({
      name: "ApiError",
      code: "HTTP_ERROR",
      message: "Request failed (500)",
    } satisfies Partial<ApiError>);
  });
});
