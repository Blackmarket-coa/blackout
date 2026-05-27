import type { CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { findCosmetic, nameplateCatalogAtom } from './cosmeticsAtoms';

interface NameplateProps {
    displayName: string;
    nameplateId?: string;
    fontSize?: number;
}

/**
 * Renders a member's display name inside an equipped nameplate cosmetic. With no
 * nameplate (or the default), it renders plain text so existing layouts are
 * unchanged.
 */
export const Nameplate = ({ displayName, nameplateId, fontSize = 20 }: NameplateProps) => {
    const catalog = useAtomValue(nameplateCatalogAtom);
    const plate = findCosmetic(catalog, nameplateId);

    if (!plate || !plate.cssGradient) {
        return <span style={{ fontSize, fontWeight: 700 }}>{displayName}</span>;
    }

    const style: CSSProperties = {
        display: 'inline-block',
        padding: '2px 12px',
        borderRadius: 999,
        fontSize,
        fontWeight: 700,
        background: plate.cssGradient,
        color: plate.textColor ?? '#ffffff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
    };
    return (
        <span data-testid="profile-nameplate" data-nameplate={plate.id} style={style}>
            {displayName}
        </span>
    );
};

export default Nameplate;
