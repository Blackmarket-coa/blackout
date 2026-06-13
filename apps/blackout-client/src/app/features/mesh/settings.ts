import type { FeatureSettingsItem } from '../../core/features/types';
import { MeshTransportSettings } from './MeshTransportSettings';

/**
 * Mesh / offline-transport settings (OSS-manifest group G6). Enterprise-tier
 * store-and-forward peer sync, gated behind the `meshTransport` flag.
 */
export const meshTransportSettings: FeatureSettingsItem[] = [
    {
        section: 'Network / Mesh transport',
        component: MeshTransportSettings,
    },
];
