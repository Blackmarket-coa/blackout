import { FriendsPanel } from '../../friends/FriendsPanel';

/**
 * Friends as a canopies-hub tab. Renders the same panel as the friends dialog;
 * navigating to a DM from here simply leaves the hub, so no close callback.
 */
export const FriendsTab = () => (
    <div style={{ padding: '4px 20px 20px' }} data-testid="canopy-friends-tab">
        <FriendsPanel />
    </div>
);

export default FriendsTab;
