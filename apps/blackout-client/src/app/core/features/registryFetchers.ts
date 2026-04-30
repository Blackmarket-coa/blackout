import {
    createAuthActions,
    createEducationActions,
    createFederatedOpsActions,
    createMjolnirActions,
    createMutualAidActions,
    createSettingsActions,
    createStegoActions,
    createThreadActivityActions,
    type ApiClient,
} from '@blackout/sdk';
import type { AuthFetcher, ThreadActivityFetcher } from '../../features/auth-threads';
import type {
    FederationHealthFetcher,
    RevenueOpsFetcher,
    TownhallFetcher,
} from '../../features/federated-ops';
import type { EducationFetcher } from '../../features/education';
import type { MjolnirFetcher } from '../../features/moderation';
import type { MutualAidFetcher } from '../../features/deaddrop';
import type {
    LabsFetcher,
    PreferencesFetcher,
    SidebarFetcher,
} from '../../features/settings-parity';
import type {
    StegoLifecycleFetcher,
    StegoToolkitFetcher,
} from '../../features/stego-toolkit';

/**
 * Bag of every page fetcher the canonical shell can wire. Each field
 * matches the `Fetcher` type a registry-mounted page accepts; pages
 * fall back to the bag when no explicit `fetcher` prop is passed.
 *
 * Keeping the bag flat (rather than nested per-feature) keeps the
 * provider boilerplate minimal — adding a new page means appending one
 * field and one builder branch instead of growing a nested object tree.
 */
export type RegistryFetchers = {
    stegoToolkit: StegoToolkitFetcher;
    stegoLifecycle: StegoLifecycleFetcher;
    mjolnir: MjolnirFetcher;
    preferences: PreferencesFetcher;
    sidebarSettings: SidebarFetcher;
    labs: LabsFetcher;
    federationHealth: FederationHealthFetcher;
    townhall: TownhallFetcher;
    revenueOps: RevenueOpsFetcher;
    auth: AuthFetcher;
    threadActivity: ThreadActivityFetcher;
    education: EducationFetcher;
    mutualAid: MutualAidFetcher;
};

export type RegistryFetcherKey = keyof RegistryFetchers;

/**
 * Builds the page fetcher bag from a single `ApiClient`. Every page
 * fetcher is a thin shape on top of one or more SDK action modules; the
 * builder centralizes the wiring so the production shell (and any
 * test/storybook host) only needs the underlying `ApiClient`.
 */
export const buildRegistryFetchers = (apiClient: ApiClient): RegistryFetchers => {
    const stego = createStegoActions(apiClient);
    const settings = createSettingsActions(apiClient);
    const mjolnir = createMjolnirActions(apiClient);
    const federatedOps = createFederatedOpsActions(apiClient);
    const auth = createAuthActions(apiClient);
    const threadActivity = createThreadActivityActions(apiClient);
    const education = createEducationActions(apiClient);
    const mutualAid = createMutualAidActions(apiClient);

    return {
        stegoToolkit: {
            listChannels: stego.listChannels,
            createChannel: stego.createChannel,
        },
        stegoLifecycle: {
            listChannels: stego.listChannels,
            rotateChannel: stego.rotateChannel,
            expireChannel: stego.expireChannel,
        },
        mjolnir: {
            listBanLists: mjolnir.listBanLists,
            addBanListRule: mjolnir.addBanListRule,
            removeBanListRule: mjolnir.removeBanListRule,
            listProtections: mjolnir.listProtections,
            setProtectionEnabled: mjolnir.setProtectionEnabled,
        },
        preferences: {
            fetchBucket: settings.fetchBucket,
            setSetting: settings.setSetting,
        },
        sidebarSettings: {
            fetchBucket: (scope, category) => settings.fetchBucket(scope, category),
            setSetting: (scope, category, key, value) =>
                settings.setSetting(scope, category, key, value),
        },
        labs: {
            fetchLabsFeatures: settings.fetchLabsFeatures,
            setLabsFeatureEnabled: settings.setLabsFeatureEnabled,
            fetchLabsGate: settings.fetchLabsGate,
            setDeveloperMode: settings.setDeveloperMode,
        },
        federationHealth: {
            listAlerts: federatedOps.listAlerts,
            acknowledgeAlert: federatedOps.acknowledgeAlert,
        },
        townhall: {
            listTownhalls: federatedOps.listTownhalls,
            transitionTownhall: federatedOps.transitionTownhall,
        },
        revenueOps: {
            getRevenueSnapshot: federatedOps.getRevenueSnapshot,
            listRevenueSnapshots: federatedOps.listRevenueSnapshots,
        },
        auth: {
            beginOidcLogin: auth.beginOidcLogin,
            // Adapt the envelope-returning SDK shape to the page's
            // `{ payload }` expectation. Centralizing the unwrap here
            // keeps every page free of envelope plumbing.
            continueOidcSession: async (input) => {
                const event = await auth.continueOidcSession(input);
                return { payload: event.payload };
            },
            signOut: auth.signOut,
        },
        threadActivity: {
            listActivity: threadActivity.listActivity,
            markActivityRead: threadActivity.markActivityRead,
        },
        education: {
            listModules: education.listModules,
            listProgress: education.listProgress,
            completeLesson: education.completeLesson,
        },
        mutualAid: {
            listThreads: mutualAid.listThreads,
            openThread: mutualAid.openThread,
            updateThreadStatus: mutualAid.updateThreadStatus,
        },
    };
};
