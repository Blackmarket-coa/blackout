import { atom } from 'jotai';
import { installedPluginsAtom } from '../../monetization/install/installedPluginsAtom';
import type { OwnedStreamAsset } from './streamAssetGoods';

/** Stream assets the current user owns (from installed stream_asset entitlements). */
export const ownedStreamAssetsAtom = atom<OwnedStreamAsset[]>((get) => {
    const out: OwnedStreamAsset[] = [];
    for (const record of get(installedPluginsAtom)) {
        if (record.streamAsset) out.push(record.streamAsset);
    }
    return out;
});

export const ownedOverlayPacksAtom = atom<OwnedStreamAsset[]>((get) =>
    get(ownedStreamAssetsAtom).filter((a) => a.assetType === 'overlay')
);

export const ownedAlertPacksAtom = atom<OwnedStreamAsset[]>((get) =>
    get(ownedStreamAssetsAtom).filter((a) => a.assetType === 'alert')
);

export const ownedChannelPointKitsAtom = atom<OwnedStreamAsset[]>((get) =>
    get(ownedStreamAssetsAtom).filter((a) => a.assetType === 'channel_point_kit')
);

export const ownedBadgeSetsAtom = atom<OwnedStreamAsset[]>((get) =>
    get(ownedStreamAssetsAtom).filter((a) => a.assetType === 'badge_set')
);
