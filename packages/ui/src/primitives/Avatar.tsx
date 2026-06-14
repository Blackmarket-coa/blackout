import React from 'react';
import { cx } from './cx';
import * as styles from './Avatar.css';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Image URL. When absent (or it fails to load) initials are shown. */
    src?: string;
    /** Display name — used for the image `alt` and the initials fallback. */
    name?: string;
    size?: AvatarSize;
}

const initialsOf = (name?: string): string => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0)).join('') || '?';
};

export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
    function Avatar({ src, name, size = 'md', className, ...rest }, ref) {
        const [failed, setFailed] = React.useState(false);
        const showImage = src && !failed;
        return (
            <span
                ref={ref}
                className={cx(styles.base, styles.sizes[size], className)}
                {...rest}
            >
                {showImage ? (
                    <img
                        className={styles.image}
                        src={src}
                        alt={name ?? ''}
                        onError={() => setFailed(true)}
                    />
                ) : (
                    <span aria-hidden>{initialsOf(name)}</span>
                )}
            </span>
        );
    },
);
