import { describe, expect, it } from 'vitest';
import {
    classifyResource,
    hostMatchesDomain,
    runShieldScan,
} from '../../../../src/app/features/privacy-tools/shield/shieldEngine';

describe('hostMatchesDomain', () => {
    it('matches exact and subdomains but not lookalikes', () => {
        expect(hostMatchesDomain('hotjar.com', 'hotjar.com')).toBe(true);
        expect(hostMatchesDomain('static.hotjar.com', 'hotjar.com')).toBe(true);
        expect(hostMatchesDomain('evil-hotjar.com', 'hotjar.com')).toBe(false);
        expect(hostMatchesDomain('hotjar.com.attacker.test', 'hotjar.com')).toBe(false);
    });
});

describe('classifyResource', () => {
    it('flags session-replay as high severity', () => {
        const finding = classifyResource('https://static.hotjar.com/c/hotjar-123.js');
        expect(finding?.category).toBe('session-replay');
        expect(finding?.severity).toBe('high');
        expect(finding?.label).toBe('Hotjar');
    });

    it('classifies trackers and advertising domains', () => {
        expect(classifyResource('https://www.google-analytics.com/analytics.js')?.category).toBe(
            'tracker'
        );
        expect(classifyResource('https://ad.doubleclick.net/ddm/x')?.category).toBe('advertising');
    });

    it('detects tracking pixels by path when no domain matches', () => {
        const finding = classifyResource('https://www.facebook.com/tr?id=99&ev=PageView');
        expect(finding?.category).toBe('pixel');
        expect(finding?.label).toBe('Meta Pixel');
    });

    it('returns null for first-party / unknown resources and invalid URLs', () => {
        expect(classifyResource('https://app.blackout.example/assets/main.js')).toBeNull();
        expect(classifyResource('not a url')).toBeNull();
    });
});

describe('runShieldScan', () => {
    it('aggregates, de-duplicates, and summarizes findings', () => {
        const report = runShieldScan({
            resourceUrls: [
                'https://static.hotjar.com/a.js',
                'https://static.hotjar.com/b.js', // same host → de-duped
                'https://www.google-analytics.com/analytics.js',
                'https://app.blackout.example/main.js', // first-party → ignored
            ],
            accessedApis: ['canvas.toDataURL', 'navigator.enumerateDevices'],
        });

        expect(report.total).toBe(4);
        expect(report.summary['session-replay']).toBe(1);
        expect(report.summary.tracker).toBe(1);
        expect(report.summary.fingerprinting).toBe(2);
    });

    it('returns an empty report for a clean page', () => {
        const report = runShieldScan({ resourceUrls: ['https://app.blackout.example/main.js'] });
        expect(report.total).toBe(0);
        expect(report.findings).toEqual([]);
    });
});
