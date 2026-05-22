import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getOnboardingAnalyticsSummary } from './onboardingTelemetry';

export const OnboardingAnalyticsPage = () => {
    const { spaceIdOrAlias } = useParams();

    const summary = useMemo(() => getOnboardingAnalyticsSummary(spaceIdOrAlias), [spaceIdOrAlias]);

    return (
        <div style={{ maxWidth: 760, margin: '24px auto', display: 'grid', gap: 10 }}>
            <h1 style={{ marginBottom: 0 }}>Onboarding funnel summary</h1>
            <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>
                Product review snapshot for onboarding drop-off and completion timing.
            </p>
            <dl
                style={{
                    margin: 0,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 8,
                }}
            >
                <dt>Started</dt>
                <dd style={{ margin: 0 }}>{summary.started}</dd>
                <dt>Completed</dt>
                <dd style={{ margin: 0 }}>{summary.completed}</dd>
                <dt>Skipped</dt>
                <dd style={{ margin: 0 }}>{summary.skipped}</dd>
                <dt>Dropped off</dt>
                <dd style={{ margin: 0 }}>{summary.droppedOff}</dd>
                <dt>Completion rate</dt>
                <dd style={{ margin: 0 }}>{summary.completionRate}%</dd>
                <dt>Avg completion time</dt>
                <dd style={{ margin: 0 }}>{summary.avgCompletionMs} ms</dd>
            </dl>

            <section>
                <h2 style={{ marginBottom: 6 }}>Drop-off by step</h2>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {Object.entries(summary.dropOffByStep).map(([step, count]) => (
                        <li key={step}>
                            {step}: {count}
                        </li>
                    ))}
                    {Object.keys(summary.dropOffByStep).length === 0 ? (
                        <li>No drop-off events tracked yet.</li>
                    ) : null}
                </ul>
            </section>

            <section data-testid="onboarding-tour-summary">
                <h2 style={{ marginBottom: 6 }}>Homepage tour</h2>
                <dl
                    style={{
                        margin: 0,
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                    }}
                >
                    <dt>Tours started</dt>
                    <dd style={{ margin: 0 }}>{summary.tour.started}</dd>
                    <dt>Tours completed</dt>
                    <dd style={{ margin: 0 }}>{summary.tour.completed}</dd>
                    <dt>Tours skipped</dt>
                    <dd style={{ margin: 0 }}>{summary.tour.skipped}</dd>
                    <dt>Debug bundle downloads</dt>
                    <dd style={{ margin: 0 }}>{summary.tour.debugBundleDownloads}</dd>
                </dl>
                <h3 style={{ marginBottom: 4, marginTop: 12 }}>Tour drop-off by step</h3>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {Object.entries(summary.tour.dropOffByStep).map(([step, count]) => (
                        <li key={step}>
                            {step}: {count}
                        </li>
                    ))}
                    {Object.keys(summary.tour.dropOffByStep).length === 0 ? (
                        <li>No tour drop-off events tracked yet.</li>
                    ) : null}
                </ul>
            </section>
        </div>
    );
};

export default OnboardingAnalyticsPage;
