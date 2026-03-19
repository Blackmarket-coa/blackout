import { describe, expect, it, vi } from "vitest";

import { ApiClient, ApiError } from "../../src/api/client";

describe("ApiClient", () => {
  it("returns mocked rooms when mock api is enabled", async () => {
    const client = new ApiClient({ baseUrl: "https://matrix.example", useMockApi: true });
    const rooms = await client.getRooms({ accessToken: "x", userId: "@u:hs" });
    expect(rooms).toHaveLength(2);
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

    const client = new ApiClient({ baseUrl: "https://matrix.example", useMockApi: false });
    await expect(client.getRooms({ accessToken: "bad", userId: "@u:hs" })).rejects.toBeInstanceOf(ApiError);
  });
});
