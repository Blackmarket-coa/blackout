import type { PlaybookAccentToken } from '@blackout/protocol';
import { Thermometer } from '../../components/thermometer/Thermometer';

/**
 * Aggregate progress thermometer for a shared den objective. A thin wrapper
 * over the generic `Thermometer` that supplies objective-specific labels:
 * `{current}/{target} {unit}` and a distinct-contributor *count*. By design it
 * shows no per-member breakdown, ranking, or attribution (System-5 banlist).
 */
export interface ObjectiveThermometerProps {
    percent: number;
    current: number;
    target: number;
    unit: string;
    contributorCount: number;
    accent?: PlaybookAccentToken;
    met?: boolean;
}

export function ObjectiveThermometer({
    percent,
    current,
    target,
    unit,
    contributorCount,
    accent,
    met,
}: ObjectiveThermometerProps) {
    return (
        <Thermometer
            percent={percent}
            accent={accent}
            met={met}
            primaryLabel={`${current}/${target} ${unit}`}
            secondaryLabel={`${contributorCount} contributing`}
            ariaLabel={`${current} of ${target} ${unit}`}
            ariaValueNow={current}
            ariaValueMax={target}
        />
    );
}

export default ObjectiveThermometer;
