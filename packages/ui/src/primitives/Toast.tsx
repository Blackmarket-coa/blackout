import React from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import * as styles from './Toast.css';

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface ToastOptions {
    id?: string;
    message: React.ReactNode;
    tone?: ToastTone;
    /** Auto-dismiss delay in ms. Pass 0 to disable. Defaults to 4000. */
    duration?: number;
}

interface ToastRecord {
    id: string;
    message: React.ReactNode;
    tone: ToastTone;
}

interface ToastContextValue {
    toast: (options: ToastOptions) => string;
    dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

let toastSeq = 0;

export const ToastProvider = ({
    children,
}: {
    children: React.ReactNode;
}): React.ReactElement => {
    const [records, setRecords] = React.useState<ToastRecord[]>([]);
    const timers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(
        new Map(),
    );

    const dismiss = React.useCallback((id: string) => {
        setRecords((current) => current.filter((record) => record.id !== id));
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
    }, []);

    const toast = React.useCallback(
        ({ id, message, tone = 'neutral', duration = 4000 }: ToastOptions) => {
            const toastId = id ?? `toast-${(toastSeq += 1)}`;
            setRecords((current) => [
                ...current.filter((record) => record.id !== toastId),
                { id: toastId, message, tone },
            ]);
            if (duration > 0) {
                timers.current.set(
                    toastId,
                    setTimeout(() => dismiss(toastId), duration),
                );
            }
            return toastId;
        },
        [dismiss],
    );

    React.useEffect(
        () => () => {
            timers.current.forEach((timer) => clearTimeout(timer));
            timers.current.clear();
        },
        [],
    );

    const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            {typeof document !== 'undefined'
                ? createPortal(
                      <div className={styles.viewport}>
                          {records.map((record) => (
                              <div
                                  key={record.id}
                                  role="status"
                                  className={cx(styles.toast, styles.tones[record.tone])}
                              >
                                  <span className={styles.message}>{record.message}</span>
                                  <button
                                      type="button"
                                      aria-label="Dismiss notification"
                                      className={styles.dismiss}
                                      onClick={() => dismiss(record.id)}
                                  >
                                      ×
                                  </button>
                              </div>
                          ))}
                      </div>,
                      document.body,
                  )
                : null}
        </ToastContext.Provider>
    );
};

/** Access the toast controller. Must be used within a `ToastProvider`. */
export const useToast = (): ToastContextValue => {
    const context = React.useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a <ToastProvider>');
    }
    return context;
};
