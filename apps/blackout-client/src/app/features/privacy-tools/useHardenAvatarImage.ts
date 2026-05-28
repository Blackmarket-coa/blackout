import { useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { privacyToolsEntitledAtom, privacyToolsSettingsAtom } from './privacyToolsAtoms';
import { hardenAvatarImage } from './hardenAvatarImage';

/**
 * Returns a function that hardens a picked avatar/image per the user's current
 * privacy settings: EXIF stripping when enabled, plus anti-facial-recognition
 * perturbation when the advanced toggle is on AND the advanced entitlement is
 * held. Avatar upload flows bypass the composer's hardening, so they call this
 * before handing the file to the upload atom.
 */
export const useHardenAvatarImage = (): ((file: File) => Promise<File>) => {
    const settings = useAtomValue(privacyToolsSettingsAtom);
    const entitled = useAtomValue(privacyToolsEntitledAtom);
    return useCallback(
        (file: File) =>
            hardenAvatarImage(file, {
                stripMetadata: settings.exifStripEnabled,
                perturb: settings.avatarPerturbationEnabled && entitled,
            }),
        [settings.exifStripEnabled, settings.avatarPerturbationEnabled, entitled]
    );
};
