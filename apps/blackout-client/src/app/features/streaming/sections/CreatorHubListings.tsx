import React from 'react';
import CreatorListings from '../../creators/CreatorListings';

/**
 * Creator Hub "Listings" section. Thin wrapper around the standalone
 * `CreatorListings` surface (also mounted at `/creator/listings`) so it can be
 * lazy-loaded into the hub tab strip with the same jsdom-isolation guarantees as
 * the other hub sections — the creator client pulls in monetization helpers that
 * aren't jsdom-friendly at module-eval time. `CreatorListings` renders its own
 * styled section header and composer, so no additional chrome is layered here.
 */
export function CreatorHubListings(): JSX.Element {
    return <CreatorListings />;
}

export default CreatorHubListings;
