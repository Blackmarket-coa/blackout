import { describe, expect, it } from 'vitest';
import { atmosphereForDate, phaseForHour } from './useTimeOfDay';
import { deriveEcosystemPulse, mockWeatherForPhase } from './context/contextMocks';
import type { UnifiedFeedItem } from './unifiedFeedModel';

describe('phaseForHour', () => {
    it('maps hours to the four day phases at their boundaries', () => {
        expect(phaseForHour(5)).toBe('dawn');
        expect(phaseForHour(7)).toBe('dawn');
        expect(phaseForHour(8)).toBe('day');
        expect(phaseForHour(16)).toBe('day');
        expect(phaseForHour(17)).toBe('dusk');
        expect(phaseForHour(19)).toBe('dusk');
        expect(phaseForHour(20)).toBe('night');
        expect(phaseForHour(4)).toBe('night');
        expect(phaseForHour(0)).toBe('night');
    });
});

describe('atmosphereForDate', () => {
    it('returns a tint + glow for the date phase', () => {
        const noon = atmosphereForDate(new Date(2026, 4, 25, 12, 0, 0));
        expect(noon.phase).toBe('day');
        expect(noon.tint).toContain('radial-gradient');
        expect(noon.glow).toMatch(/rgba/);
    });
});

describe('mockWeatherForPhase', () => {
    it('gives distinct sample weather per phase', () => {
        expect(mockWeatherForPhase('dawn').condition).not.toBe(
            mockWeatherForPhase('night').condition
        );
        expect(mockWeatherForPhase('day').icon).toBeTruthy();
    });
});

describe('deriveEcosystemPulse', () => {
    const item = (over: Partial<UnifiedFeedItem>): UnifiedFeedItem =>
        ({
            id: 'x',
            source: 'den',
            title: 't',
            subtitle: 's',
            canopyId: null,
            denId: null,
            timestamp: 0,
            score: 0,
            href: '/',
            tags: [],
            ...over,
        } as UnifiedFeedItem);

    it('counts each source into its pulse stat', () => {
        const pulse = deriveEcosystemPulse([
            item({ source: 'den' }),
            item({ source: 'den' }),
            item({ source: 'stream', live: true } as Partial<UnifiedFeedItem>),
            item({ source: 'stream', live: false } as Partial<UnifiedFeedItem>),
            item({ source: 'coliseum' }),
            item({ source: 'coalition' }),
        ]);
        const byLabel = Object.fromEntries(pulse.map((p) => [p.label, p.value]));
        expect(byLabel['Active dens']).toBe(2);
        expect(byLabel['Live now']).toBe(1);
        expect(byLabel['Open debates']).toBe(1);
        expect(byLabel['Coalition actions']).toBe(1);
    });
});
