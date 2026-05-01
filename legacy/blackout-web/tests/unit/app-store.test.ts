import { describe, expect, it, vi } from "vitest";

import { AppStore } from "../../src/store/app-store";

describe("AppStore", () => {
  it("patches domain loading flags without clobbering others", () => {
    const store = new AppStore(null);

    store.patchLoading({ auth: true });
    expect(store.getState().loading.auth).toBe(true);
    expect(store.getState().loading.messages).toBe(false);

    store.patchLoading({ messages: true });
    expect(store.getState().loading.auth).toBe(true);
    expect(store.getState().loading.messages).toBe(true);
  });

  it("persists and restores last active server/channel", () => {
    const setItem = vi.spyOn(window.localStorage.__proto__, "setItem");

    const first = new AppStore(null);
    first.patch({ activeServerId: "srv_alpha", activeChannelId: "chn_general" });

    expect(setItem).toHaveBeenCalled();

    const second = new AppStore(null);
    expect(second.getState().activeServerId).toBe("srv_alpha");
    expect(second.getState().activeChannelId).toBe("chn_general");
  });
});
