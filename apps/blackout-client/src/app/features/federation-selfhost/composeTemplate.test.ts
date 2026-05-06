import { describe, expect, it } from 'vitest';
import {
    buildSelfHostCompose,
    buildSelfHostFilename,
    validateSelfHostInput,
} from './composeTemplate';

describe('validateSelfHostInput', () => {
    it('rejects empty canopy id, malformed domain, and bad emails', () => {
        const result = validateSelfHostInput({
            canopyId: '',
            domain: 'not a domain',
            adminEmail: 'no-at-sign',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('accepts well-formed input', () => {
        const result = validateSelfHostInput({
            canopyId: 'mutual-aid-coop',
            domain: 'aid.example.coop',
            adminEmail: 'ops@aid.example.coop',
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });
});

describe('buildSelfHostCompose', () => {
    it('emits a YAML body with all four core services on default options', () => {
        const yaml = buildSelfHostCompose({
            canopyId: 'aid',
            domain: 'aid.example.coop',
            adminEmail: 'ops@aid.example.coop',
        });
        expect(yaml).toContain('postgres:');
        expect(yaml).toContain('synapse:');
        expect(yaml).toContain('matrix-media-repo:');
        expect(yaml).toContain('owncast:');
        expect(yaml).toContain('SYNAPSE_SERVER_NAME: aid.example.coop');
        expect(yaml).toContain('ADMIN_EMAIL: ops@aid.example.coop');
        expect(yaml).toMatch(/SYNAPSE_FEDERATION: "yes"/);
    });

    it('omits the owncast service when includeOwncast is false', () => {
        const yaml = buildSelfHostCompose({
            canopyId: 'silent',
            domain: 'silent.example.coop',
            adminEmail: 'ops@silent.example.coop',
            includeOwncast: false,
        });
        expect(yaml).not.toContain('owncast:');
        expect(yaml).not.toContain('owncast-data:');
    });

    it('disables outbound federation when federationTier is "local"', () => {
        const yaml = buildSelfHostCompose({
            canopyId: 'inner',
            domain: 'inner.example.coop',
            adminEmail: 'ops@inner.example.coop',
            federationTier: 'local',
        });
        expect(yaml).toMatch(/SYNAPSE_FEDERATION: "no"/);
        expect(yaml).toContain('# Federation tier: local');
    });

    it('throws on invalid input', () => {
        expect(() =>
            buildSelfHostCompose({
                canopyId: '',
                domain: '',
                adminEmail: '',
            })
        ).toThrow(/Invalid self-host input/);
    });
});

describe('buildSelfHostFilename', () => {
    it('slugifies the canopy id and falls back to "canopy"', () => {
        expect(buildSelfHostFilename('Mutual Aid Coop!')).toBe(
            'docker-compose.mutual-aid-coop.yml'
        );
        expect(buildSelfHostFilename('!@#')).toBe('docker-compose.canopy.yml');
    });
});
