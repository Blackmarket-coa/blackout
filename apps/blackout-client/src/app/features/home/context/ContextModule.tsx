import type { ReactNode } from 'react';
import * as css from './ContextSidebar.css';

interface ContextModuleProps {
    title: string;
    /** Glow colour for the module dot. */
    accent?: string;
    /** Marks the module as showing sample (not-yet-wired) data. */
    mock?: boolean;
    testid: string;
    children: ReactNode;
}

/**
 * Soft, layered card shell shared by every right-sidebar module so the
 * "context & spatial awareness" column reads as one organic stack.
 */
export const ContextModule = ({
    title,
    accent,
    mock = false,
    testid,
    children,
}: ContextModuleProps): JSX.Element => (
    <section
        className={css.module}
        data-testid={testid}
        style={accent ? ({ '--module-accent': accent } as React.CSSProperties) : undefined}
    >
        <header className={css.moduleHeader}>
            <span className={css.moduleAccent} aria-hidden="true" />
            <h3 className={css.moduleTitle}>{title}</h3>
            {mock ? (
                <span className={css.mockTag} title="Sample data — not yet wired to a live source">
                    Sample
                </span>
            ) : null}
        </header>
        {children}
    </section>
);

export default ContextModule;
