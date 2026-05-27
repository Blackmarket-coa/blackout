import { CREATE_PATH } from '../../../pages/paths';
import {
    cardStyle,
    chipRow,
    chipStyle,
    ghostButton,
    openInNewTab,
    stepDescStyle,
    stepLabelStyle,
    stepTitleStyle,
    type CreatorStepProps,
} from '../creatorOnboardingStyles';

const DEFAULT_DENS = ['Public', 'Supporter', 'Collaboration'];
const OPTIONAL_DENS = ['Workshop', 'Debate', 'Coalition', 'Subscriber'];

/**
 * Step 4 — Creator Dens. Explains the den infrastructure every creator gets and
 * records optional den types as intent. Real den creation happens via the kit
 * step (one-click apply) or the create flow — this step does not create rooms.
 */
export const DensStep = ({ draft, patch }: CreatorStepProps): JSX.Element => {
    const selected = draft.selectedDenTypes;

    const toggle = (name: string) => {
        const next = selected.includes(name)
            ? selected.filter((entry) => entry !== name)
            : [...selected, name];
        patch({ selectedDenTypes: next });
    };

    return (
        <article style={cardStyle} data-testid="creator-step-dens">
            <span style={stepLabelStyle}>Step 4 · Dens</span>
            <span style={stepTitleStyle}>Persistent community, not just followers</span>
            <span style={stepDescStyle}>
                You start with public, supporter, and collaboration dens. Add any optional dens you
                want — we’ll suggest them when you install a kit.
            </span>
            <div style={chipRow}>
                {DEFAULT_DENS.map((name) => (
                    <span key={name} style={{ ...ghostButton, cursor: 'default' }}>
                        {name} ✓
                    </span>
                ))}
            </div>
            <span style={stepDescStyle}>Optional dens</span>
            <div style={chipRow} role="group" aria-label="Optional dens">
                {OPTIONAL_DENS.map((name) => {
                    const active = selected.includes(name);
                    return (
                        <button
                            key={name}
                            type="button"
                            style={chipStyle(active)}
                            aria-pressed={active}
                            onClick={() => toggle(name)}
                            data-testid="creator-den-chip"
                            data-den={name}
                        >
                            {name}
                        </button>
                    );
                })}
            </div>
            <button
                type="button"
                style={ghostButton}
                onClick={() => openInNewTab(CREATE_PATH)}
                data-testid="creator-den-create"
            >
                Create a den now ↗
            </button>
        </article>
    );
};

export default DensStep;
