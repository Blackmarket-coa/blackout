import { MyCoalitionsPanel } from '../../coalitions/MyCoalitionsPanel';

/**
 * Coalitions as a canopies-hub tab (the slot Friends used to occupy). Renders
 * the same panel as the coalitions dialog; navigating away simply leaves the
 * hub, so no close callback.
 */
export const CoalitionsTab = () => (
    <div style={{ padding: '4px 20px 20px' }} data-testid="canopy-coalitions-tab">
        <MyCoalitionsPanel />
    </div>
);

export default CoalitionsTab;
