import type { FeatureRoute } from '../../core/features/types';
import { FEDERATION_SELF_HOST_PATH } from '../../pages/paths';
import SelfHostWizard from './SelfHostWizard';

export const federationSelfHostRoutes: FeatureRoute[] = [
    { path: FEDERATION_SELF_HOST_PATH, component: SelfHostWizard },
];
