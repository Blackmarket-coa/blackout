/**
 * Coalition Resource Registry. Tracks the shared physical capacity a coalition
 * can offer — greenhouses, CNC machines, 3D printers, commercial kitchens,
 * tools — and whether each is currently available. Canopy-scoped like
 * {@link CoalitionTask}; `location` is a free-text address (no geo decode) so
 * the row stays a regular reflected table.
 */

export const RESOURCE_AVAILABILITY = ['available', 'in_use', 'maintenance', 'retired'] as const;
export type ResourceAvailability = (typeof RESOURCE_AVAILABILITY)[number];

/** Suggested kinds for UI affordances; the stored value is free-text. */
export const SUGGESTED_RESOURCE_KINDS = [
    'greenhouse',
    'cnc',
    '3d_printer',
    'kitchen',
    'tool',
    'other',
] as const;

export interface CoalitionResource {
    id: string;
    /** The coalition (Matrix space) this resource belongs to. */
    canopyId: string;
    name: string;
    /** Free-text kind (greenhouse, cnc, 3d_printer, kitchen, tool, …). */
    kind: string;
    description?: string;
    availability: ResourceAvailability;
    stewardId: string;
    /** Free-text location/address. */
    location?: string;
    createdAt: string;
    updatedAt: string;
}

export function isResourceAvailability(value: unknown): value is ResourceAvailability {
    return (
        typeof value === 'string' &&
        (RESOURCE_AVAILABILITY as readonly string[]).includes(value)
    );
}
