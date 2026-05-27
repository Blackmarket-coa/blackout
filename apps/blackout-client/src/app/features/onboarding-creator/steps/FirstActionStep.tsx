import {
    COALITION_PATH,
    CREATE_PATH,
    CREATOR_DASHBOARD_PATH,
    CREATOR_LISTINGS_PATH,
    EVENTS_PATH,
    STREAMING_PATH,
} from '../../../pages/paths';
import { trackCreatorFirstActionChosen } from '../creatorOnboardingTelemetry';
import {
    cardStyle,
    chipRow,
    chipStyle,
    stepDescStyle,
    stepLabelStyle,
    stepTitleStyle,
    type CreatorStepProps,
} from '../creatorOnboardingStyles';

export interface FirstAction {
    id: string;
    label: string;
    to: string;
}

export const FIRST_ACTIONS: FirstAction[] = [
    { id: 'launch_stream', label: 'Launch a stream', to: STREAMING_PATH },
    { id: 'create_den', label: 'Create a den', to: CREATE_PATH },
    { id: 'schedule_event', label: 'Schedule an event', to: EVENTS_PATH },
    { id: 'create_coalition', label: 'Start a coalition', to: COALITION_PATH },
    { id: 'upload_listing', label: 'Upload a listing', to: CREATOR_LISTINGS_PATH },
    { id: 'host_discussion', label: 'Host a discussion', to: CREATE_PATH },
];

/** Resolves the destination a chosen first action should land the creator on. */
export const firstActionTarget = (actionId: string | undefined): string =>
    FIRST_ACTIONS.find((action) => action.id === actionId)?.to ?? CREATOR_DASHBOARD_PATH;

/**
 * Step 8 — First Action. Guides the creator toward an immediate productive
 * action. The chosen action determines where finishing the wizard lands them.
 */
export const FirstActionStep = ({ draft, patch }: CreatorStepProps): JSX.Element => {
    const chosen = draft.firstActionId;

    const choose = (id: string) => {
        trackCreatorFirstActionChosen(id);
        patch({ firstActionId: id });
    };

    return (
        <article style={cardStyle} data-testid="creator-step-first-action">
            <span style={stepLabelStyle}>Step 8 · First action</span>
            <span style={stepTitleStyle}>Do something now</span>
            <span style={stepDescStyle}>
                Pick your first move. We’ll drop you straight into it when you finish — you can
                always do the rest later.
            </span>
            <div style={chipRow} role="group" aria-label="First action">
                {FIRST_ACTIONS.map((action) => {
                    const active = action.id === chosen;
                    return (
                        <button
                            key={action.id}
                            type="button"
                            style={chipStyle(active)}
                            aria-pressed={active}
                            onClick={() => choose(action.id)}
                            data-testid="creator-first-action-option"
                            data-action-id={action.id}
                        >
                            {action.label}
                        </button>
                    );
                })}
            </div>
        </article>
    );
};

export default FirstActionStep;
