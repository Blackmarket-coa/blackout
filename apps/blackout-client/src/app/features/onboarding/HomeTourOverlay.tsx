import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { downloadDebugBundle } from '../settings/debugBundle';
import { visibleHomeTourSteps, type HomeTourStep } from './homeTourSteps';
import { useHomeTour } from './homeTourState';
import { isMobileViewport } from '../../pages/client/layoutMetrics';
import { useBackIntent } from '../../hooks/useBackIntent';
import {
    trackOnboardingDebugBundleDownloaded,
    trackOnboardingTourCompleted,
    trackOnboardingTourSkipped,
    trackOnboardingTourStepCompleted,
    trackOnboardingTourStepViewed,
} from './onboardingTelemetry';

type TargetRect = { top: number; left: number; width: number; height: number } | null;

const PADDING = 8;

const resolveTarget = (step: HomeTourStep): HTMLElement | null => {
    if (typeof document === 'undefined') return null;
    if (step.targetTestId) {
        const el = document.querySelector<HTMLElement>(`[data-testid="${step.targetTestId}"]`);
        if (el) return el;
    }
    if (step.fallbackRegion) {
        const el = document.querySelector<HTMLElement>(
            `[data-shell-region="${step.fallbackRegion}"]`
        );
        if (el) return el;
    }
    return null;
};

const measure = (el: HTMLElement | null): TargetRect => {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
        top: rect.top + window.scrollY - PADDING,
        left: rect.left + window.scrollX - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
    };
};

const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    pointerEvents: 'none',
};

const dimStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    pointerEvents: 'auto',
};

const tooltipStyle: CSSProperties = {
    position: 'absolute',
    maxWidth: 360,
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    padding: 16,
    display: 'grid',
    gap: 10,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
    pointerEvents: 'auto',
};

const filePathListStyle: CSSProperties = {
    margin: 0,
    padding: '6px 8px',
    background: 'var(--bg-input, #0b1220)',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: 12,
    color: 'var(--text-secondary, #cbd5e1)',
    listStyle: 'none',
    display: 'grid',
    gap: 4,
    overflowWrap: 'anywhere',
};

const docLinkRowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
};

const docLinkStyle: CSSProperties = {
    fontSize: 12,
    color: 'var(--accent-primary, #3b82f6)',
    textDecoration: 'underline',
};

/**
 * The tooltip is 360px on a roomy screen, but that is wider than a 320px
 * phone and only 15px narrower than a 375px one — so the fixed width used to
 * overhang the right edge, and the clamp below could not rescue it because it
 * was clamping against the same fixed number. Deriving the width from the
 * viewport keeps it on screen and keeps the placement maths honest.
 */
export const tooltipWidthFor = (viewportWidth: number): number =>
    Math.min(360, Math.max(240, viewportWidth - 32));

const positionTooltip = (
    rect: TargetRect,
    viewport: { width: number; height: number }
): CSSProperties => {
    const tooltipWidth = tooltipWidthFor(viewport.width);

    if (!rect) {
        return {
            ...tooltipStyle,
            maxWidth: tooltipWidth,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
        };
    }

    const estimatedHeight = 260;
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    const scrollX = typeof window !== 'undefined' ? window.scrollX : 0;

    const spaceBelow = viewport.height - (rect.top - scrollY + rect.height);
    const placeBelow = spaceBelow >= estimatedHeight + 16;

    const top = placeBelow
        ? rect.top + rect.height + 12
        : Math.max(scrollY + 16, rect.top - estimatedHeight - 12);
    const left = Math.max(
        scrollX + 16,
        Math.min(
            rect.left + rect.width / 2 - tooltipWidth / 2,
            scrollX + viewport.width - tooltipWidth - 16
        )
    );

    return {
        ...tooltipStyle,
        maxWidth: tooltipWidth,
        top,
        left,
    };
};

const SpotlightRing = ({ rect }: { rect: TargetRect }) => {
    if (!rect) return null;
    const ringStyle: CSSProperties = {
        position: 'absolute',
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        borderRadius: 12,
        border: '2px solid var(--accent-primary, #3b82f6)',
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
        pointerEvents: 'none',
        transition: 'top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease',
    };
    return <div style={ringStyle} aria-hidden="true" />;
};

export const HomeTourOverlay = (): JSX.Element | null => {
    const tour = useHomeTour();
    const [rect, setRect] = useState<TargetRect>(null);
    const [viewport, setViewport] = useState({
        width: typeof window !== 'undefined' ? window.innerWidth : 1024,
        height: typeof window !== 'undefined' ? window.innerHeight : 768,
    });
    const stepViewedAtRef = useRef<number>(Date.now());
    const stepViewLoggedRef = useRef<string | null>(null);

    // The mobile and desktop shells render different chrome, so the tour walks
    // a different set of steps on each. Derived from the viewport width this
    // component already tracks for tooltip placement, so rotating or resizing
    // mid-tour swaps the step list without a second resize listener.
    const steps = useMemo(
        () => visibleHomeTourSteps(isMobileViewport(viewport.width) ? 'mobile' : 'desktop'),
        [viewport.width]
    );

    // A persisted index can outrun a shorter list — finish the desktop tour's
    // last step, rotate to mobile, and the index now points past the end.
    // Clamping keeps the tour on screen instead of silently unmounting.
    const stepIndex = Math.min(tour.state.stepIndex, Math.max(0, steps.length - 1));
    const step = steps[stepIndex];
    const isRunning = tour.state.status === 'running' && Boolean(step);

    const recomputeRect = useCallback(() => {
        if (!step) {
            setRect(null);
            return;
        }
        const el = resolveTarget(step);
        setRect(measure(el));
    }, [step]);

    useEffect(() => {
        if (!isRunning) return;
        recomputeRect();
    }, [isRunning, recomputeRect, stepIndex]);

    useEffect(() => {
        if (!isRunning) return;
        const onResize = () => {
            setViewport({ width: window.innerWidth, height: window.innerHeight });
            recomputeRect();
        };
        const onScroll = () => recomputeRect();
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [isRunning, recomputeRect]);

    useEffect(() => {
        if (!isRunning || !step) return;
        if (stepViewLoggedRef.current === step.id) return;
        stepViewLoggedRef.current = step.id;
        stepViewedAtRef.current = Date.now();
        trackOnboardingTourStepViewed(step.id, stepIndex);
    }, [isRunning, step, stepIndex]);

    const handleAdvance = useCallback(async () => {
        if (!step) return;
        const elapsed = Date.now() - stepViewedAtRef.current;
        trackOnboardingTourStepCompleted(step.id, stepIndex, elapsed);
        const totalSteps = steps.length;
        const isLast = stepIndex >= totalSteps - 1;
        await tour.advance(totalSteps);
        if (isLast) {
            trackOnboardingTourCompleted(Date.now() - tour.state.startedAt);
        }
    }, [step, stepIndex, steps.length, tour]);

    const handleBack = useCallback(async () => {
        if (stepIndex === 0) return;
        await tour.goBack();
    }, [stepIndex, tour]);

    const handleSkip = useCallback(async () => {
        if (!step) return;
        const elapsed = Date.now() - stepViewedAtRef.current;
        trackOnboardingTourSkipped(step.id, stepIndex, elapsed);
        await tour.skip();
    }, [step, stepIndex, tour]);

    const handleDownloadBundle = useCallback(() => {
        if (!step) return;
        downloadDebugBundle({ includeLocalStorage: true, includeFeatureFlags: false });
        trackOnboardingDebugBundleDownloaded('tour', step.id);
    }, [step]);

    useEffect(() => {
        if (!isRunning) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                void handleSkip();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleSkip, isRunning]);

    // Android hardware back is the phone's Escape: dismiss the tour rather than
    // navigating Home out from under the overlay.
    useBackIntent(
        isRunning,
        useCallback(() => {
            void handleSkip();
        }, [handleSkip])
    );

    const tooltipPositionStyle = useMemo(() => positionTooltip(rect, viewport), [rect, viewport]);

    if (!isRunning || !step) return null;
    if (typeof document === 'undefined') return null;

    const totalSteps = steps.length;
    const isLast = stepIndex >= totalSteps - 1;

    return createPortal(
        <div style={overlayStyle} data-testid="home-tour-overlay" role="dialog" aria-modal="true">
            <div style={dimStyle} onClick={() => void handleSkip()} aria-hidden="true" />
            <SpotlightRing rect={rect} />
            <div style={tooltipPositionStyle} data-testid="home-tour-tooltip">
                <header style={{ display: 'grid', gap: 4 }}>
                    <small style={{ color: 'var(--text-secondary, #cbd5e1)' }}>
                        Step {stepIndex + 1} of {totalSteps}
                    </small>
                    <strong style={{ fontSize: 16 }}>{step.title}</strong>
                </header>
                <p style={{ margin: 0, color: 'var(--text-secondary, #cbd5e1)', fontSize: 13 }}>
                    {step.body}
                </p>
                {step.filePaths.length > 0 ? (
                    <div style={{ display: 'grid', gap: 4 }}>
                        <small style={{ color: 'var(--text-secondary, #cbd5e1)' }}>
                            Source files
                        </small>
                        <ul style={filePathListStyle} data-testid="home-tour-file-paths">
                            {step.filePaths.map((path) => (
                                <li key={path}>{path}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}
                {step.docLinks.length > 0 ? (
                    <div style={{ display: 'grid', gap: 4 }}>
                        <small style={{ color: 'var(--text-secondary, #cbd5e1)' }}>
                            Documentation
                        </small>
                        <div style={docLinkRowStyle} data-testid="home-tour-doc-links">
                            {step.docLinks.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={docLinkStyle}
                                >
                                    {link.label}
                                </a>
                            ))}
                        </div>
                    </div>
                ) : null}
                {step.showDebugBundle ? (
                    <button
                        type="button"
                        data-testid="home-tour-debug-bundle"
                        onClick={handleDownloadBundle}
                        style={{ width: 'fit-content' }}
                    >
                        Download debug bundle
                    </button>
                ) : null}
                <footer
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <button
                        type="button"
                        data-testid="home-tour-back"
                        onClick={() => void handleBack()}
                        disabled={stepIndex === 0}
                    >
                        Back
                    </button>
                    <div style={{ display: 'inline-flex', gap: 8 }}>
                        <button
                            type="button"
                            data-testid="home-tour-skip"
                            onClick={() => void handleSkip()}
                        >
                            Skip tour
                        </button>
                        <button
                            type="button"
                            data-testid="home-tour-next"
                            onClick={() => void handleAdvance()}
                        >
                            {isLast ? 'Finish' : 'Next'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>,
        document.body
    );
};

export default HomeTourOverlay;
