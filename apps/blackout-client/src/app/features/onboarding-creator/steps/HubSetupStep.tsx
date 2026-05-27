import {
    CREATOR_DASHBOARD_PATH,
    EVENTS_PATH,
    MONETIZATION_SUBSCRIPTIONS_PLANS_PATH,
    PROFILE_SELF_PATH,
    STREAMING_PATH,
} from '../../../pages/paths';
import {
    accentButton,
    cardStyle,
    chipRow,
    openInNewTab,
    stepDescStyle,
    stepLabelStyle,
    stepTitleStyle,
    type CreatorStepProps,
} from '../creatorOnboardingStyles';

const LINKS: { label: string; to: string }[] = [
    { label: 'Profile & banner', to: PROFILE_SELF_PATH },
    { label: 'Creator dashboard', to: CREATOR_DASHBOARD_PATH },
    { label: 'Memberships & tiers', to: MONETIZATION_SUBSCRIPTIONS_PLANS_PATH },
    { label: 'Events', to: EVENTS_PATH },
    { label: 'Streaming', to: STREAMING_PATH },
];

/**
 * Step 3 — Creator Hub Setup. Deep-links into the Creator Studio surfaces the
 * creator configures by hand. Links open in a new tab so the wizard resumes
 * where it left off.
 */
export const HubSetupStep = (_props: CreatorStepProps): JSX.Element => (
    <article style={cardStyle} data-testid="creator-step-hub-setup">
        <span style={stepLabelStyle}>Step 3 · Creator hub</span>
        <span style={stepTitleStyle}>Build your headquarters</span>
        <span style={stepDescStyle}>
            Set up your profile theme, banner, storefront, memberships, events, and streaming. Each
            opens in a new tab — come back here when you’re done.
        </span>
        <div style={chipRow}>
            {LINKS.map((link) => (
                <button
                    key={link.to}
                    type="button"
                    style={accentButton}
                    onClick={() => openInNewTab(link.to)}
                    data-testid="creator-hub-link"
                >
                    {link.label} ↗
                </button>
            ))}
        </div>
    </article>
);

export default HubSetupStep;
