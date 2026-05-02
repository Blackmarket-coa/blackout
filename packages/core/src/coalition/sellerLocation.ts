export const SELLER_LOCATION_TYPES = [
    'storefront',
    'farm',
    'kitchen',
    'garden',
    'mobile',
    'online_only',
] as const;

export type SellerLocationType = (typeof SELLER_LOCATION_TYPES)[number];

export interface SellerCoordinates {
    latitude: number;
    longitude: number;
}

export interface SellerLocation {
    id: string;
    sellerId: string;
    coordinates: SellerCoordinates;
    addressLine: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    displayRadiusMeters: number;
    isVisible: boolean;
    locationType: SellerLocationType;
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

export function haversineDistanceMeters(a: SellerCoordinates, b: SellerCoordinates): number {
    const dLat = toRadians(b.latitude - a.latitude);
    const dLng = toRadians(b.longitude - a.longitude);
    const sinHalfLat = Math.sin(dLat / 2);
    const sinHalfLng = Math.sin(dLng / 2);
    const h =
        sinHalfLat * sinHalfLat +
        Math.cos(toRadians(a.latitude)) *
            Math.cos(toRadians(b.latitude)) *
            sinHalfLng *
            sinHalfLng;
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isWithinDisplayRadius(
    location: SellerLocation,
    viewer: SellerCoordinates,
): boolean {
    return haversineDistanceMeters(location.coordinates, viewer) <= location.displayRadiusMeters;
}
