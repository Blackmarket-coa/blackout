import { describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_CANOPY_NAME,
    DiscordStructureError,
    countPlanItems,
    parseDiscordStructure,
} from '../../../../src/app/features/create/discordStructure';
import { runDiscordImport } from '../../../../src/app/features/create/runDiscordImport';

describe('parseDiscordStructure', () => {
    it('maps every Discord channel type to its den kind and groups by category', () => {
        const json = JSON.stringify({
            name: 'Coalition HQ',
            channels: [
                { id: '1', type: 4, name: 'Text Stuff', position: 1 },
                { id: '2', type: 0, name: 'general', parent_id: '1', position: 1, topic: 'hi' },
                { id: '3', type: 5, name: 'announce', parent_id: '1', position: 0 },
                { id: '4', type: 2, name: 'Lounge', parent_id: '1', position: 2 },
                { id: '5', type: 13, name: 'Stage', position: 0 },
                { id: '6', type: 15, name: 'Forum', position: 5 },
            ],
        });

        const plan = parseDiscordStructure(json);

        expect(plan.canopyName).toBe('Coalition HQ');
        // Uncategorized (no parent_id) come first, ordered by position.
        expect(plan.uncategorized.map((d) => [d.name, d.kind])).toEqual([
            ['Stage', 'stage'],
            ['Forum', 'forum'],
        ]);
        // One category, its dens ordered by position (announce@0 before general@1).
        expect(plan.categories).toHaveLength(1);
        expect(plan.categories[0].name).toBe('Text Stuff');
        expect(plan.categories[0].dens.map((d) => [d.name, d.kind])).toEqual([
            ['announce', 'announcement'],
            ['general', 'text'],
            ['Lounge', 'voice'],
        ]);
        // Topic carried through.
        expect(plan.categories[0].dens.find((d) => d.name === 'general')?.topic).toBe('hi');
    });

    it('accepts string channel types and a bare array with no guild name', () => {
        const plan = parseDiscordStructure(
            JSON.stringify([
                { id: '1', type: 'GUILD_TEXT', name: 'chat' },
                { id: '2', type: 'GUILD_STAGE_VOICE', name: 'stage' },
            ])
        );
        expect(plan.canopyName).toBe(DEFAULT_CANOPY_NAME);
        expect(plan.uncategorized.map((d) => d.kind)).toEqual(['text', 'stage']);
    });

    it('skips threads and unknown types, recording why', () => {
        const plan = parseDiscordStructure(
            JSON.stringify([
                { id: '1', type: 0, name: 'keep' },
                { id: '2', type: 11, name: 'a-thread' },
                { id: '3', type: 99, name: 'mystery' },
            ])
        );
        expect(plan.uncategorized.map((d) => d.name)).toEqual(['keep']);
        expect(plan.skipped.map((s) => s.name)).toEqual(['a-thread', 'mystery']);
        // 1 (canopy) + 1 kept den + 0 categories.
        expect(countPlanItems(plan)).toBe(2);
    });

    it('throws typed errors for malformed input', () => {
        expect(() => parseDiscordStructure('')).toThrow(DiscordStructureError);
        expect(() => parseDiscordStructure('not json')).toThrowError(/valid JSON/i);
        try {
            parseDiscordStructure('   ');
        } catch (e) {
            expect((e as DiscordStructureError).code).toBe('invalid-json');
        }
        try {
            parseDiscordStructure(JSON.stringify({ channels: [] }));
        } catch (e) {
            expect((e as DiscordStructureError).code).toBe('empty-structure');
        }
    });
});

describe('runDiscordImport', () => {
    const plan = {
        canopyName: 'Imported',
        uncategorized: [{ name: 'lobby', kind: 'text' as const }],
        categories: [
            {
                name: 'Ops',
                dens: [
                    { name: 'planning', kind: 'text' as const },
                    { name: 'voice', kind: 'voice' as const },
                ],
            },
        ],
        skipped: [],
    };

    it('creates canopy → uncategorized dens → category → its dens, in order', async () => {
        const calls: string[] = [];
        const mx = {
            createRoom: vi.fn(async () => {
                calls.push('canopy');
                return { room_id: '!canopy:s' };
            }),
            // createDenInCanopy / createCategoryInCanopy call these under the hood;
            // stub the whole surface they touch.
            sendStateEvent: vi.fn(async () => ({})),
            getDomain: () => 's',
        } as never;

        // createCategoryInCanopy + createDenInCanopy both call mx.createRoom too,
        // so distinguish by creation_content.type via the mock implementation.
        (mx as { createRoom: ReturnType<typeof vi.fn> }).createRoom = vi.fn(
            async (opts: { creation_content?: { type?: string }; name?: string }) => {
                if (opts?.creation_content?.type === 'm.space' && opts?.name === 'Imported') {
                    calls.push('canopy:Imported');
                } else if (opts?.creation_content?.type === 'm.space') {
                    calls.push(`category:${opts?.name}`);
                } else {
                    calls.push(`den:${opts?.name}`);
                }
                return { room_id: `!room-${calls.length}:s` };
            }
        );

        const report = await runDiscordImport(mx, plan);

        expect(report.canopyId).toBe('!room-1:s');
        expect(report.failed).toHaveLength(0);
        // Canopy first, then uncategorized den, then category, then its dens.
        expect(calls).toEqual([
            'canopy:Imported',
            'den:lobby',
            'category:Ops',
            'den:planning',
            'den:voice',
        ]);
    });

    it('continues past a den failure and reports it', async () => {
        let n = 0;
        const mx = {
            createRoom: vi.fn(
                async (opts: { creation_content?: { type?: string }; name?: string }) => {
                    n += 1;
                    if (opts?.name === 'planning') throw new Error('boom');
                    return { room_id: `!room-${n}:s` };
                }
            ),
            sendStateEvent: vi.fn(async () => ({})),
            getDomain: () => 's',
        } as never;

        const report = await runDiscordImport(mx, plan);
        expect(report.failed.map((f) => f.name)).toEqual(['planning']);
        // The other dens still got created (lobby + voice) plus canopy + category.
        expect(report.created.some((c) => c.name === 'voice')).toBe(true);
    });
});
