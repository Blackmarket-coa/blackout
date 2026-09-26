import React, { type ReactNode } from 'react';
import { Box, Text, color, config } from 'folds';

export type FormSubmitBarProps = {
    /** Required fields that currently hold a valid value. */
    completed: number;
    /** Total required fields. */
    total: number;
    /** Shown in place of the counter once every required field is valid. */
    readyLabel?: string;
    /** The submit button(s). */
    children: ReactNode;
    'data-testid'?: string;
};

/**
 * Submit row for long inline settings forms. It sticks to the bottom of the
 * scroll container while the form is on screen, so the primary action is
 * always reachable on a phone instead of sitting below several screens of
 * fields, and it states how many required fields are left so a disabled
 * button never reads as a dead end.
 */
export function FormSubmitBar({
    completed,
    total,
    readyLabel = 'Ready',
    children,
    'data-testid': testId,
}: FormSubmitBarProps) {
    const ready = completed >= total;
    return (
        <Box
            alignItems="Center"
            justifyContent="SpaceBetween"
            gap="200"
            wrap="Wrap"
            data-testid={testId}
            style={{
                position: 'sticky',
                bottom: 0,
                zIndex: 1,
                marginTop: config.space.S100,
                padding: `${config.space.S200} 0`,
                background: color.SurfaceVariant.Container,
                borderTop: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
            }}
        >
            <Text size="T200" priority={ready ? '400' : '300'} aria-live="polite">
                {ready ? readyLabel : `${completed} of ${total} required fields filled`}
            </Text>
            <Box gap="200">{children}</Box>
        </Box>
    );
}

export default FormSubmitBar;
