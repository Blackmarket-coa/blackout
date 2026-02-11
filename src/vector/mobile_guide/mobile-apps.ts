/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

/*
 * Shared code that is used by the mobile guide and the mobile.element.io site.
 */

export enum MobileAppVariant {
    Classic = "element-classic",
    X = "element",
    Pro = "element-pro",
}

export interface MobileAppMetadata {
    name: string;
    appleAppId: string;
    appStoreUrl: string;
    playStoreUrl: string;
    fDroidUrl?: string;
    deepLinkPath: string;
    usesLegacyDeepLink: boolean;
    isProApp: boolean;
}

export const mobileApps: Record<MobileAppVariant, MobileAppMetadata> = {
    [MobileAppVariant.Classic]: {
        name: "Blackout",
        appleAppId: "id0000000000",
        appStoreUrl: "https://apps.apple.com/app/blackout-secure/id0000000000",
        playStoreUrl: "https://play.google.com/store/apps/details?id=io.blackout.app",
        fDroidUrl: "https://f-droid.org/packages/io.blackout.app",
        deepLinkPath: "",
        usesLegacyDeepLink: true,
        isProApp: false,
    },
    [MobileAppVariant.X]: {
        name: "Blackout X",
        appleAppId: "id0000000001",
        appStoreUrl: "https://apps.apple.com/app/blackout-x-secure-chat/id0000000001",
        playStoreUrl: "https://play.google.com/store/apps/details?id=io.blackout.app.x",
        fDroidUrl: "https://f-droid.org/packages/io.blackout.app.x",
        deepLinkPath: "/blackout",
        usesLegacyDeepLink: false,
        isProApp: false,
    },
    [MobileAppVariant.Pro]: {
        name: "Blackout Pro",
        appleAppId: "id0000000002",
        appStoreUrl: "https://apps.apple.com/app/blackout-pro-work/id0000000002",
        playStoreUrl: "https://play.google.com/store/apps/details?id=io.blackout.enterprise",
        deepLinkPath: "/blackout-pro",
        usesLegacyDeepLink: false,
        isProApp: true,
    },
};

export function updateMobilePage(metadata: MobileAppMetadata, deepLinkUrl: string, server: string | undefined): void {
    const appleMeta = document.querySelector('meta[name="apple-itunes-app"]') as Element;
    appleMeta.setAttribute("content", `app-id=${metadata.appleAppId}`);

    if (server) {
        (document.getElementById("header_title") as HTMLHeadingElement).innerText = `Join ${server} on Blackout`;
    }
    (document.getElementById("app_store_link") as HTMLAnchorElement).href = metadata.appStoreUrl;
    (document.getElementById("play_store_link") as HTMLAnchorElement).href = metadata.playStoreUrl;

    if (metadata.fDroidUrl) {
        (document.getElementById("f_droid_link") as HTMLAnchorElement).href = metadata.fDroidUrl;
    } else {
        document.getElementById("f_droid_section")!.style.display = "none";
    }

    const step1Heading = document.getElementById("step1_heading")!;
    step1Heading.innerHTML = step1Heading!.innerHTML.replace("Element", metadata.name);

    // Step 2 is only shown on the mobile guide, not on mobile.element.io
    if (document.getElementById("step2_container")) {
        document.getElementById("step2_container")!.style.display = "block";
        if (metadata.isProApp) {
            document.getElementById("step2_description")!.innerHTML = "Use your work email to join";
        }
        (document.getElementById("deep_link_button") as HTMLAnchorElement).href = deepLinkUrl;
    }
}
