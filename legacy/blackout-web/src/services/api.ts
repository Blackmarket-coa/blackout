import { ApiClient } from "../api/client";
import { blackoutWebConfig } from "../index";

export function createApiClient(): ApiClient {
  return new ApiClient({
    baseUrl: blackoutWebConfig.homeserverUrl,
    useMockApi: import.meta.env.VITE_USE_MOCK_API !== "false",
  });
}
