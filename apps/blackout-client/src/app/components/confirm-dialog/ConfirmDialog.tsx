import React, { ReactNode } from 'react';
import FocusTrap from 'focus-trap-react';
import {
    Box,
    Button,
    Dialog,
    Header,
    Icon,
    IconButton,
    Icons,
    Overlay,
    OverlayBackdrop,
    OverlayCenter,
    Spinner,
    Text,
    color,
    config,
} from 'folds';
import { stopPropagation } from '../../utils/keyboard';

export type ConfirmDialogVariant = 'Critical' | 'Primary';

export type ConfirmDialogProps = {
    title: string;
    description: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmDialogVariant;
    loading?: boolean;
    error?: string | null;
    onConfirm: () => void;
    onCancel: () => void;
};

export function ConfirmDialog({
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'Critical',
    loading = false,
    error = null,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const closeLabel = `Close, ${title.toLowerCase().replace(/[?.!]$/, '')} dialog`;

    return (
        <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
                <FocusTrap
                    focusTrapOptions={{
                        initialFocus: false,
                        onDeactivate: loading ? undefined : onCancel,
                        clickOutsideDeactivates: !loading,
                        escapeDeactivates: stopPropagation,
                    }}
                >
                    <Dialog variant="Surface" data-testid="modal-confirm">
                        <Header
                            style={{
                                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                                borderBottomWidth: config.borderWidth.B300,
                            }}
                            variant="Surface"
                            size="500"
                        >
                            <Box grow="Yes">
                                <Text size="H4">{title}</Text>
                            </Box>
                            <IconButton
                                size="300"
                                onClick={onCancel}
                                radii="300"
                                aria-label={closeLabel}
                                disabled={loading}
                            >
                                <Icon src={Icons.Cross} />
                            </IconButton>
                        </Header>
                        <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                            <Box direction="Column" gap="200">
                                <Text priority="400">{description}</Text>
                                {error && (
                                    <Text style={{ color: color.Critical.Main }} size="T300">
                                        {error}
                                    </Text>
                                )}
                            </Box>
                            <Box direction="Column" gap="200">
                                <Button
                                    variant={variant}
                                    onClick={onConfirm}
                                    disabled={loading}
                                    before={
                                        loading ? (
                                            <Spinner variant={variant} fill="Solid" size="200" />
                                        ) : undefined
                                    }
                                    data-testid="modal-confirm-button"
                                >
                                    <Text size="B400">{confirmLabel}</Text>
                                </Button>
                                <Button
                                    variant="Secondary"
                                    fill="Soft"
                                    onClick={onCancel}
                                    disabled={loading}
                                    data-testid="modal-confirm-cancel"
                                >
                                    <Text size="B400">{cancelLabel}</Text>
                                </Button>
                            </Box>
                        </Box>
                    </Dialog>
                </FocusTrap>
            </OverlayCenter>
        </Overlay>
    );
}
