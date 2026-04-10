import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { DecorationOption, MemberProfile, ProfileConnection } from './profileTypes';

export const availableDecorations: DecorationOption[] = [
    {
        id: 'none',
        label: 'None',
        cssGradient: 'transparent',
        cssGlow: 'transparent',
    },
    {
        id: 'ring-solarpunk-01',
        label: 'Solar Ring I',
        cssGradient: 'conic-gradient(from 120deg, #f9c74f, #90be6d, #43aa8b, #4d908e, #f9c74f)',
        cssGlow: 'rgba(78, 205, 196, 0.45)',
    },
    {
        id: 'ring-solarpunk-02',
        label: 'Solar Ring II',
        cssGradient: 'conic-gradient(from 200deg, #ffd166, #06d6a0, #118ab2, #ef476f, #ffd166)',
        cssGlow: 'rgba(6, 214, 160, 0.35)',
    },
    {
        id: 'ring-solarpunk-03',
        label: 'Civic Aurora',
        cssGradient: 'linear-gradient(135deg, #80ed99, #4cc9f0, #5390d9)',
        cssGlow: 'rgba(76, 201, 240, 0.4)',
        gated: true,
    },
];

const defaultConnections: ProfileConnection[] = [
    { type: 'github', username: 'blackout-user', url: 'https://github.com/blackout-user' },
    { type: 'website', label: 'Project Site', url: 'https://example.org' },
];

export const myProfileAtom = atomWithStorage<MemberProfile>('blackout.profile.self.v1', {
    userId: '@you:example.org',
    displayName: 'Alex Rivers',
    avatarUrl: 'https://placehold.co/160x160/png',
    primaryRole: 'Moderator',
    roleBadges: ['Moderator', 'Builder', 'Verified'],
    mutualSpaces: ['Solarpunk Commons', 'BMC Townhall', 'Design Ops'],
    isFriend: false,
    profile: {
        banner: 'https://placehold.co/1400x360/png',
        bio: 'Hi! I maintain **community** spaces and care about *privacy-first* defaults.\n\nBuilding safer, calmer chat for everyone.',
        pronouns: 'they/them',
        connections: defaultConnections,
        decoration: 'ring-solarpunk-01',
    },
});

export const viewedProfileAtom = atom<MemberProfile | null>(null);

export const profileModalOpenAtom = atom(false);
