import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * BO-1 telemetry reaching a report.
 *
 * `matrixLogger` counts the decrypt/key-backup lines it suppresses, but until
 * these fields were added the counter had no consumer anywhere in the app — the
 * 2026-08-10 encryption audit could not answer "how bad is the key-backup
 * DecryptionError problem?" for exactly that reason. These tests pin the wiring
 * so the signal cannot go dark again without a failure here.
 *
 * Both report surfaces are covered because they collect differently: the
 * settings form forwards the whole `CollectedDiagnostics` object, while the
 * widget copies named fields and would silently drop a new one.
 */

const getSuppressedLogCounts = vi.fn();

vi.mock('../../src/client/matrixLogger', () => ({
    getSuppressedLogCounts: () => getSuppressedLogCounts(),
}));

const { collectDiagnostics } = await import('../../src/app/lib/diagnostics/collect');
const { collectWidgetMetadata } = await import(
    '../../src/app/features/bug-widget/widgetReportState'
);

describe('suppressed-log counts in diagnostics', () => {
    beforeEach(() => {
        getSuppressedLogCounts.mockReset();
        getSuppressedLogCounts.mockReturnValue({
            pushRule: 3,
            keyBackupProbe: 7,
            decryptUtd: 42,
        });
    });

    it('carries the counts on the settings-page diagnostics', () => {
        expect(collectDiagnostics().suppressedLogCounts).toEqual({
            pushRule: 3,
            keyBackupProbe: 7,
            decryptUtd: 42,
        });
    });

    it('does not throw if the logger is unavailable', () => {
        // The report form must still submit when the matrix client never booted —
        // which is itself a state users report from.
        getSuppressedLogCounts.mockImplementation(() => {
            throw new Error('no client');
        });

        expect(() => collectDiagnostics()).not.toThrow();
        expect(collectDiagnostics().suppressedLogCounts).toEqual({
            pushRule: 0,
            keyBackupProbe: 0,
            decryptUtd: 0,
        });
    });

    it('attaches the UTD count to a widget report', () => {
        const meta = collectWidgetMetadata();
        expect(meta.undecryptableEvents).toBe(42);
        expect(meta.keyBackupProbes).toBe(7);
    });

    it('omits the widget fields entirely on a healthy device', () => {
        getSuppressedLogCounts.mockReturnValue({
            pushRule: 5,
            keyBackupProbe: 0,
            decryptUtd: 0,
        });

        const meta = collectWidgetMetadata();
        expect(meta).not.toHaveProperty('undecryptableEvents');
        expect(meta).not.toHaveProperty('keyBackupProbes');
    });

    it('carries no message, room, or user identifiers', () => {
        // These reports can end up on a public issue tracker.
        const counts = collectDiagnostics().suppressedLogCounts;
        expect(Object.keys(counts).sort()).toEqual(['decryptUtd', 'keyBackupProbe', 'pushRule']);
        for (const value of Object.values(counts)) {
            expect(typeof value).toBe('number');
        }
    });
});
