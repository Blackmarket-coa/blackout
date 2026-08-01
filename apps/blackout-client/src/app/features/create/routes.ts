import type { FeatureRoute } from '../../core/features/types';
import { CREATE_IMPORT_PATH, CREATE_PATH } from '../../pages/paths';
import CreateHub from './CreateHub';
import DiscordImportPage from './DiscordImportPage';

/**
 * `/create` — the Create hub the onboarding flow links to — plus the
 * Discord structure importer sub-route. `CreateHub` is dependency-light
 * (jotai + router only); the importer's heavy body is lazy-loaded inside
 * `DiscordImportPage` so registry composition stays jsdom-independent.
 */
export const createRoutes: FeatureRoute[] = [
    { path: CREATE_PATH, component: CreateHub },
    { path: CREATE_IMPORT_PATH, component: DiscordImportPage },
];
