import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from 'react';
import { ConfirmDialog, ConfirmDialogVariant } from './ConfirmDialog';
import { formatMatrixError } from '../../utils/matrixError';

export type ConfirmOptions = {
    title: string;
    description: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmDialogVariant;
    /**
     * Optional async work to run when the user confirms. The dialog stays
     * mounted in a loading state until the promise settles; on rejection
     * the error is rendered inline (formatted via `formatMatrixError`) and
     * the user can retry or cancel. On resolve the promise returned by
     * `confirm()` settles to `true`.
     *
     * Without this, `confirm()` resolves to `true` immediately on click and
     * the caller owns the side effect.
     */
    onConfirm?: () => Promise<void> | void;
    /**
     * Fallback copy used when `onConfirm` rejects with something other than
     * a known Matrix error. Defaults to "Something went wrong. Please try again."
     */
    errorFallback?: string;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

type DialogState = ConfirmOptions & {
    loading: boolean;
    error: string | null;
};

type ProviderProps = {
    children: ReactNode;
};

export function ConfirmProvider({ children }: ProviderProps) {
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const resolverRef = useRef<((value: boolean) => void) | null>(null);

    const settle = useCallback((value: boolean) => {
        const resolver = resolverRef.current;
        resolverRef.current = null;
        setDialog(null);
        if (resolver) resolver(value);
    }, []);

    const confirm = useCallback<ConfirmFn>((options) => {
        return new Promise<boolean>((resolve) => {
            resolverRef.current = resolve;
            setDialog({ ...options, loading: false, error: null });
        });
    }, []);

    const handleConfirm = useCallback(async () => {
        if (!dialog) return;

        if (!dialog.onConfirm) {
            settle(true);
            return;
        }

        setDialog((prev) => (prev ? { ...prev, loading: true, error: null } : prev));
        try {
            await dialog.onConfirm();
            settle(true);
        } catch (err) {
            const message = formatMatrixError(
                err,
                dialog.errorFallback ?? 'Something went wrong. Please try again.',
            );
            setDialog((prev) => (prev ? { ...prev, loading: false, error: message } : prev));
        }
    }, [dialog, settle]);

    const handleCancel = useCallback(() => {
        if (dialog?.loading) return;
        settle(false);
    }, [dialog, settle]);

    const value = useMemo(() => confirm, [confirm]);

    return (
        <ConfirmContext.Provider value={value}>
            {children}
            {dialog && (
                <ConfirmDialog
                    title={dialog.title}
                    description={dialog.description}
                    confirmLabel={dialog.confirmLabel}
                    cancelLabel={dialog.cancelLabel}
                    variant={dialog.variant}
                    loading={dialog.loading}
                    error={dialog.error}
                    onConfirm={() => void handleConfirm()}
                    onCancel={handleCancel}
                />
            )}
        </ConfirmContext.Provider>
    );
}

export function useConfirm(): ConfirmFn {
    const ctx = useContext(ConfirmContext);
    if (!ctx) {
        throw new Error('useConfirm must be called inside <ConfirmProvider>');
    }
    return ctx;
}
