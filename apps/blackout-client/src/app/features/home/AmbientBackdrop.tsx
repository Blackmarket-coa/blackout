import classNames from 'classnames';
import * as css from './AmbientBackdrop.css';
import type { TimeOfDayAtmosphere } from './useTimeOfDay';

interface AmbientBackdropProps {
    atmosphere: TimeOfDayAtmosphere;
    reducedMotion: boolean;
}

/**
 * Decorative living-ecosystem wash behind the home feed: a time-of-day tint
 * plus three slow "breathing" colour blobs (leaf / mint / ember). Purely
 * presentational — `aria-hidden`, no pointer events — and motion is dropped
 * entirely when the viewer prefers reduced motion.
 */
export const AmbientBackdrop = ({
    atmosphere,
    reducedMotion,
}: AmbientBackdropProps): JSX.Element => (
    <div
        className={css.root}
        aria-hidden="true"
        data-testid="home-ambient-backdrop"
        data-phase={atmosphere.phase}
        style={
            {
                '--home-tint': atmosphere.tint,
                '--home-glow': atmosphere.glow,
            } as React.CSSProperties
        }
    >
        <div className={css.tintLayer} />
        <div className={classNames(css.blobLeaf, !reducedMotion && css.animatedLeaf)} />
        <div className={classNames(css.blobMint, !reducedMotion && css.animatedMint)} />
        <div className={classNames(css.blobEmber, !reducedMotion && css.animatedEmber)} />
    </div>
);

export default AmbientBackdrop;
