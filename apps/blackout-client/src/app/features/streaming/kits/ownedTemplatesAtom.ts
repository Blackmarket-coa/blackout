import { atom } from 'jotai';
import { installedPluginsAtom } from '../../monetization/install/installedPluginsAtom';
import { templateToKit, type OwnedTemplate } from './communityTemplate';
import type { CreatorKit } from './kitCatalog';

/** Community templates the current user owns (from installed entitlements). */
export const ownedTemplatesAtom = atom<OwnedTemplate[]>((get) => {
    const out: OwnedTemplate[] = [];
    for (const record of get(installedPluginsAtom)) {
        if (record.template) out.push(record.template);
    }
    return out;
});

/** Owned templates adapted to CreatorKits for the kit catalog UI. */
export const ownedTemplateKitsAtom = atom<CreatorKit[]>((get) =>
    get(ownedTemplatesAtom).map(templateToKit)
);
