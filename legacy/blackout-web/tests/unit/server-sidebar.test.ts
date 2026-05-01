import { describe, expect, it } from "vitest";

import { renderServerSidebar } from "../../src/components/ServerSidebar";

describe("renderServerSidebar", () => {
  it("renders core shell order Home/Rooms/DMs/Activity/Calls", () => {
    const html = renderServerSidebar({
      servers: [{ id: "s1", name: "HQ", role: "member" }],
      activeServerId: "s1",
      activeView: "rooms",
      showAdminEntry: false,
    });

    const home = html.indexOf('aria-label="Home"');
    const rooms = html.indexOf('aria-label="Rooms"');
    const dms = html.indexOf('aria-label="Direct messages"');
    const activity = html.indexOf('aria-label="Activity inbox"');
    const calls = html.indexOf('aria-label="Calls"');

    expect(home).toBeGreaterThan(-1);
    expect(home).toBeLessThan(rooms);
    expect(rooms).toBeLessThan(dms);
    expect(dms).toBeLessThan(activity);
    expect(activity).toBeLessThan(calls);
    expect(html).not.toContain('aria-label="Admin"');
  });

  it("shows role-gated admin entry when enabled", () => {
    const html = renderServerSidebar({
      servers: [{ id: "s1", name: "HQ", role: "admin" }],
      activeServerId: "s1",
      activeView: "admin",
      showAdminEntry: true,
    });

    expect(html).toContain('aria-label="Admin"');
  });
});
