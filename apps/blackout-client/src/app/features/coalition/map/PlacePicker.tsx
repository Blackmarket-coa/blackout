import React, { useCallback, useState, type CSSProperties } from 'react';
import {
    AREA_RADIUS_OPTIONS_KM,
    formatRadius,
    type CoalitionPlace,
    type PlaceKind,
} from '@blackout/core';
import { coarsenCoordinate, useLocationConsentFlow } from '../../location/locationConsent';
import { LocationConsentDialog } from '../../location/LocationConsentDialog';

const DEFAULT_AREA_RADIUS_METERS = 5_000;

const fieldStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: 8,
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 13,
};

const chipStyle = (active: boolean): CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--accent-primary, #1ABC9C)' : 'var(--border-default)'}`,
    background: active ? 'var(--accent-primary, #1ABC9C)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
});

type Mode = 'none' | PlaceKind;

const modeOf = (place: CoalitionPlace | null): Mode => place?.kind ?? 'none';

export interface PlacePickerProps {
    value: CoalitionPlace | null;
    onChange: (place: CoalitionPlace | null) => void;
    /** Rendered above the controls; say what is being placed. */
    label?: string;
    /** Prefix for `data-testid` hooks, so several pickers can coexist. */
    testId?: string;
}

/**
 * Put a coalition thing on the map — as a pin, or as an area of operations.
 *
 * Needs, projects and resources are real-world things that had no coordinates,
 * so they were reachable only from the tool bag. This is what gives them one.
 *
 * Three states rather than two, because "nowhere" is a real answer. A need for
 * a developer has no location, and a picker that forces one would scatter
 * fictional pins across the map. Nothing is placed until someone chooses to.
 *
 * **Pin vs area.** A pin is an address — the greenhouse is *here*. An area says
 * the centre is a reference point and the radius is the actual claim: a crew
 * covering the north side, a delivery range, a project spanning a district.
 * Keeping them distinct is what lets the map answer "who reaches me?" honestly.
 *
 * **"Use my location" coarsens.** The device's precise position is snapped to
 * the same ~1.1km grid the map's near-me filter uses, for both modes. Someone
 * publishing an exact address can type it; nobody publishes their exact
 * standing position by tapping one button.
 */
export function PlacePicker({ value, onChange, label, testId = 'place' }: PlacePickerProps) {
    const mode = modeOf(value);
    const consent = useLocationConsentFlow();
    const [locating, setLocating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /**
     * The last radius this picker was set to. Held outside the value because a
     * pin genuinely has no radius — but without remembering it, flipping to pin
     * to reconsider and back would silently reset a chosen 50km to the default,
     * and publish the wrong claim.
     */
    const [lastRadiusMeters, setLastRadiusMeters] = useState(
        value?.kind === 'area' ? value.radiusMeters : DEFAULT_AREA_RADIUS_METERS
    );

    const setMode = useCallback(
        (next: Mode) => {
            if (next === 'none') {
                onChange(null);
                return;
            }
            // Carry the coordinates across a mode switch — someone who typed a
            // location then decided it was an area shouldn't retype it.
            const latitude = value?.latitude ?? 0;
            const longitude = value?.longitude ?? 0;
            const placeLabel = value?.label;
            onChange(
                next === 'area'
                    ? {
                          kind: 'area',
                          latitude,
                          longitude,
                          radiusMeters:
                              value?.kind === 'area' ? value.radiusMeters : lastRadiusMeters,
                          label: placeLabel,
                      }
                    : { kind: 'pin', latitude, longitude, label: placeLabel }
            );
        },
        [onChange, value, lastRadiusMeters]
    );

    const setRadius = useCallback(
        (radiusMeters: number) => {
            setLastRadiusMeters(radiusMeters);
            if (value?.kind === 'area') onChange({ ...value, radiusMeters });
        },
        [onChange, value]
    );

    const patch = useCallback(
        (fields: Partial<{ latitude: number; longitude: number; label: string }>) => {
            if (!value) return;
            onChange({ ...value, ...fields });
        },
        [onChange, value]
    );

    const useMyLocation = useCallback(() => {
        if (!value) return;
        if (!consent.granted) {
            consent.requestEnable();
            return;
        }
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setError('This device cannot report a location.');
            return;
        }
        setLocating(true);
        setError(null);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocating(false);
                patch({
                    latitude: coarsenCoordinate(position.coords.latitude),
                    longitude: coarsenCoordinate(position.coords.longitude),
                });
            },
            () => {
                setLocating(false);
                setError('Could not read your location.');
            },
            { maximumAge: 60_000, timeout: 10_000 }
        );
    }, [consent, patch, value]);

    return (
        <div
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            data-testid={`${testId}-picker`}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {label ? (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                ) : null}
                <button
                    type="button"
                    onClick={() => setMode('none')}
                    aria-pressed={mode === 'none'}
                    style={chipStyle(mode === 'none')}
                    data-testid={`${testId}-mode-none`}
                >
                    No location
                </button>
                <button
                    type="button"
                    onClick={() => setMode('pin')}
                    aria-pressed={mode === 'pin'}
                    style={chipStyle(mode === 'pin')}
                    data-testid={`${testId}-mode-pin`}
                    title="An exact spot on the map"
                >
                    📍 Pin
                </button>
                <button
                    type="button"
                    onClick={() => setMode('area')}
                    aria-pressed={mode === 'area'}
                    style={chipStyle(mode === 'area')}
                    data-testid={`${testId}-mode-area`}
                    title="A radius around a centre — an area of operations"
                >
                    ◎ Area
                </button>
            </div>

            {value ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input
                            type="number"
                            step="any"
                            value={value.latitude}
                            onChange={(event) =>
                                patch({ latitude: Number.parseFloat(event.target.value) || 0 })
                            }
                            placeholder="Latitude"
                            aria-label="Latitude"
                            style={fieldStyle}
                            data-testid={`${testId}-latitude`}
                        />
                        <input
                            type="number"
                            step="any"
                            value={value.longitude}
                            onChange={(event) =>
                                patch({ longitude: Number.parseFloat(event.target.value) || 0 })
                            }
                            placeholder="Longitude"
                            aria-label="Longitude"
                            style={fieldStyle}
                            data-testid={`${testId}-longitude`}
                        />
                        <button
                            type="button"
                            onClick={useMyLocation}
                            disabled={locating}
                            style={chipStyle(false)}
                            data-testid={`${testId}-locate`}
                        >
                            {locating ? 'Locating…' : '⌖ Use my location'}
                        </button>
                    </div>

                    {value.kind === 'area' ? (
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            Area of operations
                            <select
                                value={value.radiusMeters}
                                onChange={(event) =>
                                    setRadius(Number.parseInt(event.target.value, 10))
                                }
                                style={{ ...fieldStyle, flex: '0 0 auto' }}
                                data-testid={`${testId}-radius`}
                            >
                                {AREA_RADIUS_OPTIONS_KM.map((km) => (
                                    <option key={km} value={km * 1000}>
                                        {formatRadius(km * 1000)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : null}

                    <input
                        value={value.label ?? ''}
                        onChange={(event) => patch({ label: event.target.value })}
                        placeholder={
                            value.kind === 'area'
                                ? 'Name this area (optional)'
                                : 'Address or landmark (optional)'
                        }
                        aria-label="Place label"
                        style={fieldStyle}
                        data-testid={`${testId}-label`}
                    />

                    {error ? (
                        <span style={{ fontSize: 12, color: 'var(--danger, #E74C3C)' }}>
                            {error}
                        </span>
                    ) : null}
                </div>
            ) : null}

            <LocationConsentDialog
                open={consent.disclosureOpen}
                onConfirm={consent.confirmEnable}
                onCancel={consent.cancelEnable}
            />
        </div>
    );
}

export default PlacePicker;
