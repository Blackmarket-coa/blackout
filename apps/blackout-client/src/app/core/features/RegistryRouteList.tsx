import { createElement } from 'react';
import { Route, useRoutes, type RouteObject } from 'react-router';
import { buildFeatureRegistry } from './buildRegistry';
import { composeFeatureRoutes } from './composition';
import { defaultFeatureFlags, type FeatureFlags } from './featureFlags';
import { useCapabilityContext } from './capabilityContext';
import { getAllFeaturePlugins } from './plugins';
import { PluginRouteBoundary } from './PluginRouteBoundary';
import type { CapabilityGateContext } from './capabilityGate';
import type { FeatureRoute } from './types';

/**
 * Builds a registry from the context's `flags` so runtime capability +
 * flag changes (env-driven toggles, dev overrides) also re-include
 * features that were filtered out at module-load time. Feature flags not
 * supplied fall back to `defaultFeatureFlags`. The dynamic plugin
 * registry is consulted so marketplace-installed plugins contribute
 * routes alongside the static ones.
 */
const registryForContext = (context: CapabilityGateContext) =>
    buildFeatureRegistry(
        { ...defaultFeatureFlags, ...(context.flags ?? {}) } as FeatureFlags,
        getAllFeaturePlugins()
    );

/**
 * Wraps a route's element in `PluginRouteBoundary` so a crashing plugin
 * is contained to its own destination instead of blanking the shell.
 */
const renderRouteElement = (route: FeatureRoute) => (
    <PluginRouteBoundary pluginId={route.pluginId ?? route.path}>
        {createElement(route.component)}
    </PluginRouteBoundary>
);

/**
 * Hook returning a `<Route>` element array ready to splice into an
 * existing `<Routes>` element. Callers use it like:
 *
 *   const registryRoutes = useRegistryRouteElements();
 *   return <Routes>{...legacyRoutes}{registryRoutes}</Routes>;
 *
 * Use `buildRegistryRouteObjects` instead when wiring into
 * `createBrowserRouter`'s static route array (e.g. in `main.tsx`).
 */
export const useRegistryRouteElements = () => {
    const ctx = useCapabilityContext();
    const routes = composeFeatureRoutes(registryForContext(ctx), ctx);
    return routes.map((route) =>
        createElement(Route, {
            key: route.path,
            path: route.path,
            element: renderRouteElement(route),
        })
    );
};

/**
 * Standalone component that mounts the registry routes via `useRoutes`,
 * suitable for embedding outside an existing `<Routes>` block. Renders
 * `null` when the URL matches no registry route.
 */
export function RegistryRouteList() {
    const ctx = useCapabilityContext();
    const objects: RouteObject[] = composeFeatureRoutes(registryForContext(ctx), ctx).map(
        (route) => ({
            path: route.path,
            element: renderRouteElement(route),
        })
    );
    return useRoutes(objects);
}

/**
 * Returns a static `RouteObject[]` for `createBrowserRouter`. Capability
 * context is captured at call time — callers that need reactive routing
 * should rebuild the router when the context atom changes.
 */
export const buildRegistryRouteObjects = (context: CapabilityGateContext): RouteObject[] => {
    const routes = composeFeatureRoutes(registryForContext(context), context);
    return routes.map((route) => ({
        path: route.path,
        element: renderRouteElement(route),
    }));
};
