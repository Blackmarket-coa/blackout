import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { DecorationOption, MemberProfile } from './profileTypes';

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

// The self-profile starts empty and is hydrated from the logged-in Matrix
// account (display name + avatar) by `SelfProfileHydrator`, which only fills
// fields the user hasn't set. Matrix supplies name + avatar; everything else
// stays empty until the user edits it, rather than shipping fabricated data.
//
// Storage key bumped v1 → v2 to drop the legacy mock profile ("Alex Rivers",
// placehold.co avatar, fake bio/role/connections) that older builds persisted:
// existing installs re-seed empty and re-hydrate from Matrix on next login.
export const myProfileAtom = atomWithStorage<MemberProfile>('blackout.profile.self.v2', {
    userId: '',
    displayName: '',
    avatarUrl: undefined,
    primaryRole: undefined,
    roleBadges: [],
    mutualSpaces: [],
    isFriend: false,
    profile: {},
});

export const viewedProfileAtom = atom<MemberProfile | null>(null);

export const profileModalOpenAtom = atom(false);
