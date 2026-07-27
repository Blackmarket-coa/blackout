import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { NormalizedEntitlement } from '@blackout/core';
import type { SignedPluginBundle } from '@blackout/sdk';
import { authStateAtom } from '../../../state/auth';
import { fetchEntitlements, fetchFulfillmentBundle } from '../marketplace/marketplaceClient';
import { readBlackoutApiToken } from '../marketplace/useMarketplaceAuth';
import { ensureBlackoutApiToken } from '../../../../client/blackoutApiSession';
import { installedPluginsAtom, type InstalledPluginRecord } from './installedPluginsAtom';
import { installEntitlement } from './pluginInstaller';
import { capabilityContextAtom } from '../../../core/features/capabilityContext';

/**
 * Mount once inside the logged-in tree to re-establish plugin state on
 * every cold load:
 *
 *  1. Records persisted by `installedPluginsAtom` survived the reload but
 *     the *runtime* registrations (sandboxes, dynamic feature plugins,
 *     sidebar panels) live in module-scope memory and were lost. We
 *     re-run `installEntitlement` for each known record to remount.
 *  2. Server-side `/v1/marketplace/entitlements` may contain entitlements
 *     granted out-of-band (gift, admin grant, deep-link checkout) that
 *     the user never walked through the in-page install dialog for. We
 *     install those on first encounter so home-rail cards / sidebar
 *     entries appear without requiring a visit to the Plugins page.
 *  3. Records whose entitlement is no longer `granted` are pruned, so a
 *     refund / revoke takes effect on next boot.
 *
 * Hydration runs once per session per user. Failures are logged but never
 * thrown — a bad bundle for one plugin must not block the rest.
 */
export const PluginEntitlementHydrator = (): null => {
    const authState = useAtomValue(authStateAtom);
    const setInstalled = useSetAtom(installedPluginsAtom);
    // Audit M19: boot hydration is the highest-traffic activation path — honor
    // the code-plugin gate here so granted code_plugin entitlements are not
    // silently mounted at cold load while the sandbox host RPC is stubbed.
    const codePluginsEnabled = useAtomValue(capabilityContextAtom).flags.pluginCodeSandbox;
    const hydratedRef = useRef(false);

    useEffect(() => {
        if (authState !== 'logged_in') {
            hydratedRef.current = false;
            return;
        }
        if (hydratedRef.current) return;
        hydratedRef.current = true;

        let cancelled = false;

        const run = async () => {
            // Resolve a token (awaiting the exchange if needed); bail when
            // there's no API session yet so boot doesn't fire a 401 at
            // /v1/marketplace/entitlements.
            const token = readBlackoutApiToken() ?? (await ensureBlackoutApiToken());
            if (cancelled) return;
            if (!token) return;
            let entitlements: NormalizedEntitlement[] = [];
            try {
                entitlements = await fetchEntitlements(token);
            } catch (err) {
                console.warn('[plugins] failed to load entitlements at boot', err);
                return;
            }
            if (cancelled) return;

            // Snapshot the persisted records once so we can drive the
            // reconciliation off a stable list while installEntitlement
            // mutates the underlying registries.
            const stored = readPersistedRecords();
            const storedById = new Map(stored.map((r) => [r.entitlementId, r]));

            const granted = entitlements.filter((e) => e.status === 'granted');
            const grantedIds = new Set(granted.map((e) => e.id));

            const nextRecords: InstalledPluginRecord[] = [];

            for (const entitlement of granted) {
                if (cancelled) return;
                const prior = storedById.get(entitlement.id);
                try {
                    const result = await installEntitlement(entitlement, {
                        fetchSignedBundle: (id) => fetchBundleAsSignedPlugin(id, token),
                        approvedCapabilities: prior?.grantedCapabilities,
                        codePluginsEnabled,
                    });
                    // Preserve the user's previously-granted capability
                    // subset and installedAt timestamp across remounts.
                    nextRecords.push(
                        prior
                            ? {
                                  ...result.record,
                                  installedAt: prior.installedAt,
                                  grantedCapabilities: prior.grantedCapabilities,
                              }
                            : result.record
                    );
                } catch (err) {
                    console.warn(`[plugins] failed to hydrate entitlement ${entitlement.id}`, err);
                    if (prior) {
                        nextRecords.push({
                            ...prior,
                            status: 'error',
                            lastError: err instanceof Error ? err.message : String(err),
                        });
                    }
                }
            }

            // Keep records the server hasn't acknowledged yet (offline,
            // partial response) but drop anything whose entitlement was
            // revoked. The latter is the explicit pruning step.
            for (const record of stored) {
                if (grantedIds.has(record.entitlementId)) continue;
                if (entitlements.some((e) => e.id === record.entitlementId)) {
                    // Entitlement exists server-side but isn't granted →
                    // drop the local record.
                    continue;
                }
                // No server response for this id → keep it in case the
                // page is offline.
                nextRecords.push(record);
            }

            if (cancelled) return;
            setInstalled(nextRecords);
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [authState, setInstalled, codePluginsEnabled]);

    return null;
};

const readPersistedRecords = (): InstalledPluginRecord[] => {
    try {
        const raw = window.localStorage.getItem('blackout.plugins.installed.v1');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed as InstalledPluginRecord[];
    } catch {
        return [];
    }
};

const fetchBundleAsSignedPlugin = async (
    entitlementId: string,
    token: string | null
): Promise<SignedPluginBundle> => {
    const payload = await fetchFulfillmentBundle(entitlementId, token);
    // SignedBundlePayload.manifest is typed as `Record<string, unknown>`
    // on the wire; the api guarantees `PluginManifest` shape, so the cast
    // is the boundary where we accept the server's contract.
    return {
        manifest: payload.manifest as unknown as SignedPluginBundle['manifest'],
        bundleBase64: payload.bundleBase64,
        signature: payload.signature,
    };
};

export default PluginEntitlementHydrator;
