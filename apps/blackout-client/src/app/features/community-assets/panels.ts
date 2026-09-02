import type { ShellPanelEntry } from '../../core/features/types';
import { ASSETS_PATH } from './nav';

export const communityAssetPanels: ShellPanelEntry[] = [
    {
        id: 'community-assets.sidebar',
        kind: 'sidebar',
        label: 'Made here',
        description: 'Stickers, memes and coins people made — and the place to make one',
        to: ASSETS_PATH,
        order: 40,
    },
];
