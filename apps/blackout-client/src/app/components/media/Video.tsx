import React, { VideoHTMLAttributes, forwardRef } from 'react';
import classNames from 'classnames';
import * as css from './media.css';

export const Video = forwardRef<HTMLVideoElement, VideoHTMLAttributes<HTMLVideoElement>>(
    ({ className, ...props }, ref) => (
        <video className={classNames(css.Video, className)} {...props} ref={ref} />
    )
);
