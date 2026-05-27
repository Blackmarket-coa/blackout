import { CREATOR_ARCHETYPES } from '../creatorArchetypes';
import {
    cardStyle,
    chipRow,
    chipStyle,
    stepDescStyle,
    stepLabelStyle,
    stepTitleStyle,
    type CreatorStepProps,
} from '../creatorOnboardingStyles';

/**
 * Step 1 — Creator Identity. The creator picks one or more archetypes; the
 * selection drives the suggested Creator Kit later in the wizard.
 */
export const ArchetypeStep = ({ draft, patch }: CreatorStepProps): JSX.Element => {
    const selected = draft.selectedArchetypes;

    const toggle = (id: string) => {
        const next = selected.includes(id)
            ? selected.filter((entry) => entry !== id)
            : [...selected, id];
        patch({ selectedArchetypes: next });
    };

    return (
        <article style={cardStyle} data-testid="creator-step-identity">
            <span style={stepLabelStyle}>Step 1 · Identity</span>
            <span style={stepTitleStyle}>What are you building?</span>
            <span style={stepDescStyle}>
                Pick the archetypes that fit you. This shapes your profile layout, tools, and the
                Creator Kit we suggest — choose as many as apply.
            </span>
            <div style={chipRow} role="group" aria-label="Creator archetypes">
                {CREATOR_ARCHETYPES.map((archetype) => {
                    const active = selected.includes(archetype.id);
                    return (
                        <button
                            key={archetype.id}
                            type="button"
                            style={chipStyle(active)}
                            aria-pressed={active}
                            onClick={() => toggle(archetype.id)}
                            data-testid="creator-archetype-chip"
                            data-archetype-id={archetype.id}
                        >
                            <span aria-hidden="true">{archetype.glyph}</span>
                            {archetype.label}
                        </button>
                    );
                })}
            </div>
        </article>
    );
};

export default ArchetypeStep;
