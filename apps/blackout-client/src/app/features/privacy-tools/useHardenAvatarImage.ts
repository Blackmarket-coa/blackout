import { useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { privacyToolsEntitledAtom, privacyToolsSettingsAtom } from './privacyToolsAtoms';
import { hardenAvatarImage } from './hardenAvatarImage';

/**
 * Returns a function that hardens a picked avatar/image: EXIF stripping always
 * runs (native hygiene), plus anti-facial-recognition perturbation when the
 * user has enabled it AND holds the advanced `privacy_tool` entitlement.
 */
export const useHardenAvatarImage = (): ((file: File) => Promise<File>) => {
    const settings = useAtomValue(privacyToolsSettingsAtom);
    const entitled = useAtomValue(privacyToolsEntitledAtom);
    return useCallback(
        (file: File) =>
            hardenAvatarImage(file, {
                stripMetadata: true,
                perturb: settings.avatarPerturbationEnabled && entitled,
            }),
        [settings.avatarPerturbationEnabled, entitled]
    );
};
