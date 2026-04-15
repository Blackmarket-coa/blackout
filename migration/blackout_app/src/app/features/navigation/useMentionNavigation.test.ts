import { describe, expect, it } from 'vitest';
import { buildMentionDeepLink, getMentionJumpEventId } from './useMentionNavigation';

describe('mention navigation helpers', () => {
    it('jumps to source context for threaded mentions', () => {
        const target = {
            roomId: '!ops:example.org',
            eventId: '$reply',
            sourceEventId: '$thread-root',
        };

        expect(getMentionJumpEventId(target)).toBe('$thread-root');
        expect(buildMentionDeepLink(target)).toBe(
            '/room/!ops%3Aexample.org?event=%24thread-root&source=%24reply',
        );
    });

    it('falls back to event id when no source context exists', () => {
        const target = {
            roomId: '!ops:example.org',
            eventId: '$direct',
        };

        expect(getMentionJumpEventId(target)).toBe('$direct');
        expect(buildMentionDeepLink(target)).toBe('/room/!ops%3Aexample.org?event=%24direct');
    });
});
