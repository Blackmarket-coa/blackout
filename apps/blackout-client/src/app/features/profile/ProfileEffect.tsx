import { useAtomValue } from 'jotai';
import { findCosmetic, profileEffectCatalogAtom } from './cosmeticsAtoms';
import './ProfileEffect.css';

interface ProfileEffectProps {
    profileEffectId?: string;
}

/**
 * Decorative overlay layer for an equipped profile-effect cosmetic. Renders an
 * absolutely-positioned element, so the host container must be `position:
 * relative`. Renders nothing when no (non-default) effect is equipped.
 */
export const ProfileEffect = ({ profileEffectId }: ProfileEffectProps) => {
    const catalog = useAtomValue(profileEffectCatalogAtom);
    const cosmetic = findCosmetic(catalog, profileEffectId);
    if (!cosmetic || !cosmetic.effect) return null;
    return (
        <div
            aria-hidden
            data-testid="profile-effect"
            data-effect={cosmetic.effect}
            className={`bmc-profile-effect bmc-profile-effect--${cosmetic.effect}`}
        />
    );
};

export default ProfileEffect;
