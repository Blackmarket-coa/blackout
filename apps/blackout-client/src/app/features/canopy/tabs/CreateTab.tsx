import { CreateHub } from '../../create/CreateHub';

/**
 * Start a new canopy, or import one from Discord. Embeds the existing
 * `/create` hub so there is one create flow, reachable from two places.
 */
export const CreateTab = () => (
    <div data-testid="canopy-create-tab">
        <CreateHub />
    </div>
);

export default CreateTab;
