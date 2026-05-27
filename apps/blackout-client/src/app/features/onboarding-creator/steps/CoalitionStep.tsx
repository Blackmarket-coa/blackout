import { COALITION_PATH } from '../../../pages/paths';
import {
    accentButton,
    cardStyle,
    chipStyle,
    ghostButton,
    openInNewTab,
    stepDescStyle,
    stepLabelStyle,
    stepTitleStyle,
    type CreatorStepProps,
} from '../creatorOnboardingStyles';

/**
 * Step 5 — Coalition Integration. Opt into local discovery and event/workshop
 * hosting, connecting the creator into the spatial ecosystem.
 */
export const CoalitionStep = ({ draft, patch }: CreatorStepProps): JSX.Element => {
    const optedIn = draft.coalitionOptIn === true;

    return (
        <article style={cardStyle} data-testid="creator-step-coalition">
            <span style={stepLabelStyle}>Step 5 · Coalition</span>
            <span style={stepTitleStyle}>Connect to your local ecosystem</span>
            <span style={stepDescStyle}>
                Opt into local discovery, regional communities, and event/workshop hosting so
                nearby creators and members can find you on the Coalition map.
            </span>
            <button
                type="button"
                style={chipStyle(optedIn)}
                aria-pressed={optedIn}
                onClick={() => patch({ coalitionOptIn: !optedIn })}
                data-testid="creator-coalition-optin"
            >
                {optedIn ? 'Local discovery enabled ✓' : 'Enable local discovery'}
            </button>
            {optedIn ? (
                <button
                    type="button"
                    style={accentButton}
                    onClick={() => openInNewTab(COALITION_PATH)}
                    data-testid="creator-coalition-open"
                >
                    Open Coalition ↗
                </button>
            ) : (
                <button
                    type="button"
                    style={ghostButton}
                    onClick={() => openInNewTab(COALITION_PATH)}
                    data-testid="creator-coalition-preview"
                >
                    Preview the Coalition map ↗
                </button>
            )}
        </article>
    );
};

export default CoalitionStep;
