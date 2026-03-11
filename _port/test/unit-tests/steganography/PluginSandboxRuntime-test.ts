/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { PluginSandboxConformanceError, PluginSandboxRuntime } from "../../../src/steganography/plugins/PluginSandbox";

describe("PluginSandboxRuntime", () => {
    it("registers capability-conformant plugins and executes capability hooks", () => {
        const runtime = new PluginSandboxRuntime();
        runtime.registerPlugin({
            manifest: {
                id: "reverse",
                name: "Reverse",
                version: "1.0.0",
                capabilities: ["transform"],
            },
            module: {
                transform: (input) => input.split("").reverse().join(""),
            },
        });

        expect(runtime.executeTransform("reverse", "matrix")).toBe("xirtam");
    });

    it("rejects registration when declared capabilities are missing implementations", () => {
        const runtime = new PluginSandboxRuntime();

        expect(() =>
            runtime.registerPlugin({
                manifest: {
                    id: "broken-render",
                    name: "Broken Render",
                    version: "1.0.0",
                    capabilities: ["render"],
                },
                module: {},
            }),
        ).toThrow(PluginSandboxConformanceError);
    });

    it("uses explicit prompt->grant->revoke permission lifecycle", () => {
        const runtime = new PluginSandboxRuntime({ approvedNetworkOrigins: ["https://plugins.matrix.example"] });
        runtime.registerPlugin({
            manifest: {
                id: "network-audit",
                name: "Network Audit",
                version: "1.0.0",
                capabilities: ["encode"],
                networkPolicy: "approved_background",
            },
            module: {
                encode: (payload) => payload,
            },
        });

        expect(runtime.getPermissionSnapshot("network-audit").network).toBe("prompt");
        expect(runtime.grantNetworkPermission("network-audit").network).toBe("granted");
        expect(runtime.revokeNetworkPermission("network-audit").network).toBe("denied");
    });

    it("blocks network requests unless permission is granted", () => {
        const runtime = new PluginSandboxRuntime({ approvedNetworkOrigins: ["https://plugins.matrix.example"] });
        runtime.registerPlugin({
            manifest: {
                id: "remote-theme",
                name: "Remote Theme",
                version: "1.0.0",
                capabilities: ["render"],
                networkPolicy: "approved_background",
            },
            module: {
                render: (input) => input,
            },
        });

        expect(() =>
            runtime.runPluginNetworkRequest("remote-theme", {
                url: "https://plugins.matrix.example/assets/theme.json",
            }),
        ).toThrow(PluginSandboxConformanceError);

        runtime.grantNetworkPermission("remote-theme");
        expect(
            runtime.runPluginNetworkRequest("remote-theme", {
                url: "https://plugins.matrix.example/assets/theme.json",
            }),
        ).toEqual({
            status: 204,
            body: "network_request_recorded",
        });
    });

    it("blocks raw socket and non-allowlisted outbound requests", () => {
        const runtime = new PluginSandboxRuntime({ approvedNetworkOrigins: ["https://plugins.matrix.example"] });
        runtime.registerPlugin({
            manifest: {
                id: "socket-probe",
                name: "Socket Probe",
                version: "1.0.0",
                capabilities: ["decode"],
                networkPolicy: "approved_background",
            },
            module: {
                decode: (payload) => payload,
            },
        });

        runtime.grantNetworkPermission("socket-probe");

        expect(() =>
            runtime.runPluginNetworkRequest("socket-probe", {
                url: "wss://plugins.matrix.example/socket",
            }),
        ).toThrow(PluginSandboxConformanceError);

        expect(() =>
            runtime.runPluginNetworkRequest("socket-probe", {
                url: "https://evil.example/collect",
            }),
        ).toThrow(PluginSandboxConformanceError);
    });

    it("rejects permission grants for plugins that declare no network policy", () => {
        const runtime = new PluginSandboxRuntime();
        runtime.registerPlugin({
            manifest: {
                id: "offline-only",
                name: "Offline",
                version: "1.0.0",
                capabilities: ["encode"],
            },
            module: {
                encode: (payload) => payload,
            },
        });

        expect(() => runtime.grantNetworkPermission("offline-only")).toThrow(PluginSandboxConformanceError);
    });
});
