import React, { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
    AREA_RADIUS_OPTIONS_KM,
    formatRadius,
    geocodeResultToPlace,
    type CoalitionPlace,
    type GeocodeResult,
    type PlaceKind,
} from '@blackout/core';
import { coarsenCoordinate, useLocationConsentFlow } from '../../location/locationConsent';
import { LocationConsentDialog } from '../../location/LocationConsentDialog';
import { geocodeAddress } from '../coalitionClient';

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

/**
 * One coordinate, typed.
 *
 * The field owns its text and only publishes a number once the text is one:
 * finite and inside the world. Binding a controlled input straight to the
 * number and parsing every keystroke with a zero fallback meant a cleared field
 * snapped the pin to 0,0 and a leading "-" became 0 before its digits arrived —
 * so no negative longitude could be typed, which is most of the Americas.
 *
 * Text rather than `type="number"` on purpose. A number input's value
 * sanitization discards partial input ("-", "47.") as the empty string, so the
 * half-typed state cannot be held or tested; its scroll-wheel and arrow-key
 * stepping also change a coordinate by accident. `inputMode="decimal"` still
 * gets the numeric keypad on a phone.
 *
 * Out-of-range input stays on screen and is flagged rather than silently
 * dropped — otherwise the field and the pin disagree and someone saves a
 * position they cannot see.
 */
function CoordinateField({
    value,
    onChange,
    limit,
    label,
    testId,
}: {
    value: number;
    onChange: (next: number) => void;
    /** Absolute bound: 90 for latitude, 180 for longitude. */
    limit: number;
    label: string;
    testId: string;
}) {
    const [text, setText] = useState(() => String(value));
    const committed = useRef(value);

    // Follow the value when it changes from somewhere else — "Use my location",
    // a mode switch — but never while it merely echoes what was just typed, or
    // the caret jumps mid-edit.
    useEffect(() => {
        if (value !== committed.current) {
            committed.current = value;
            setText(String(value));
        }
    }, [value]);

    const parsed = Number.parseFloat(text);
    const invalid = text.trim() !== '' && (!Number.isFinite(parsed) || Math.abs(parsed) > limit);

    return (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <input
                type="text"
                inputMode="decimal"
                value={text}
                onChange={(event) => {
                    const next = event.target.value;
                    setText(next);
                    const candidate = Number.parseFloat(next);
                    if (Number.isFinite(candidate) && Math.abs(candidate) <= limit) {
                        committed.current = candidate;
                        onChange(candidate);
                    }
                }}
                placeholder={label}
                aria-label={label}
                aria-invalid={invalid || undefined}
                style={fieldStyle}
                data-testid={testId}
            />
            {invalid ? (
                <span
                    style={{ fontSize: 11, color: 'var(--danger, #E74C3C)' }}
                    data-testid={`${testId}-error`}
                >
                    {label} must be between -{limit} and {limit}.
                </span>
            ) : null}
        </div>
    );
}

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

    // Address search, proxied by the API against whatever geocoder the operator
    // configured. Unconfigured servers answer 503 and the reason is shown here
    // rather than swallowed, so it is obvious the feature needs setting up
    // rather than looking broken.
    const [addressQuery, setAddressQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [matches, setMatches] = useState<GeocodeResult[] | null>(null);

    const searchAddress = useCallback(async () => {
        const query = addressQuery.trim();
        if (query.length < 3 || searching) return;
        setSearching(true);
        setSearchError(null);
        setMatches(null);
        try {
            const response = await geocodeAddress(query);
            setMatches(response.results);
        } catch (err: unknown) {
            setSearchError(err instanceof Error ? err.message : 'Address search failed.');
        } finally {
            setSearching(false);
        }
    }, [addressQuery, searching]);

    const chooseMatch = useCallback(
        (match: GeocodeResult) => {
            // A geocoder answers "where is this address", which is a point. If
            // the current place is an area, keep that shape and just move its
            // centre — the radius is a claim only the author can make.
            const pin = geocodeResultToPlace(match);
            onChange(
                value?.kind === 'area'
                    ? {
                          ...value,
                          latitude: pin.latitude,
                          longitude: pin.longitude,
                          label: pin.label,
                      }
                    : pin
            );
            setMatches(null);
            setAddressQuery('');
        },
        [onChange, value]
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
                    {/*
                     * Address first, coordinates second. Typing a latitude is
                     * the fallback, not the expectation — but it stays, since
                     * a server with no geocoder configured has nothing else.
                     */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input
                            value={addressQuery}
                            onChange={(event) => setAddressQuery(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key !== 'Enter') return;
                                // The picker lives inside a composer form;
                                // Enter here must search, not submit the form.
                                event.preventDefault();
                                void searchAddress();
                            }}
                            placeholder="Search an address…"
                            aria-label="Search an address"
                            style={fieldStyle}
                            data-testid={`${testId}-address`}
                        />
                        <button
                            type="button"
                            onClick={() => void searchAddress()}
                            disabled={searching || addressQuery.trim().length < 3}
                            style={chipStyle(false)}
                            data-testid={`${testId}-address-search`}
                        >
                            {searching ? 'Searching…' : '🔎 Search'}
                        </button>
                    </div>

                    {searchError ? (
                        <span
                            style={{ fontSize: 12, color: 'var(--danger, #E74C3C)' }}
                            role="alert"
                            data-testid={`${testId}-address-error`}
                        >
                            {searchError}
                        </span>
                    ) : null}

                    {matches?.length === 0 ? (
                        <span
                            style={{ fontSize: 12, color: 'var(--text-muted)' }}
                            data-testid={`${testId}-address-empty`}
                        >
                            No matches. Try a broader search, or enter coordinates below.
                        </span>
                    ) : null}

                    {matches && matches.length > 0 ? (
                        <ul
                            style={{
                                listStyle: 'none',
                                margin: 0,
                                padding: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                            }}
                            data-testid={`${testId}-address-results`}
                        >
                            {matches.map((match) => (
                                <li key={`${match.latitude},${match.longitude},${match.label}`}>
                                    <button
                                        type="button"
                                        onClick={() => chooseMatch(match)}
                                        style={{
                                            ...fieldStyle,
                                            width: '100%',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                        }}
                                        data-testid={`${testId}-address-result`}
                                    >
                                        {match.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <CoordinateField
                            value={value.latitude}
                            onChange={(latitude) => patch({ latitude })}
                            limit={90}
                            label="Latitude"
                            testId={`${testId}-latitude`}
                        />
                        <CoordinateField
                            value={value.longitude}
                            onChange={(longitude) => patch({ longitude })}
                            limit={180}
                            label="Longitude"
                            testId={`${testId}-longitude`}
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
