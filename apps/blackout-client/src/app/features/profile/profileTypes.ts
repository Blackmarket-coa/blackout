export const BMC_PROFILE_EVENT_TYPE = 'co.bmc.profile';

export type ConnectionType = 'github' | 'website' | 'x' | 'linkedin' | 'matrix' | 'other';

export interface ProfileConnection {
  type: ConnectionType;
  username?: string;
  label?: string;
  url: string;
}

export interface BmcProfileEvent {
  banner?: string;
  bio?: string;
  pronouns?: string;
  connections?: ProfileConnection[];
  decoration?: string;
}

export interface MemberProfile {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  primaryRole?: string;
  roleBadges: string[];
  mutualSpaces: string[];
  isFriend?: boolean;
  profile: BmcProfileEvent;
}

export interface DecorationOption {
  id: string;
  label: string;
  cssGradient: string;
  cssGlow: string;
  gated?: boolean;
}

export const sanitizeProfileEvent = (input: unknown): BmcProfileEvent => {
  if (!input || typeof input !== 'object') return {};
  const data = input as Record<string, unknown>;

  const connections = Array.isArray(data.connections)
    ? data.connections
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          type: typeof item.type === 'string' ? (item.type as ConnectionType) : 'other',
          username: typeof item.username === 'string' ? item.username : undefined,
          label: typeof item.label === 'string' ? item.label : undefined,
          url: typeof item.url === 'string' ? item.url : '',
        }))
        .filter((item) => item.url)
    : [];

  return {
    banner: typeof data.banner === 'string' ? data.banner : undefined,
    bio: typeof data.bio === 'string' ? data.bio.slice(0, 2000) : '',
    pronouns: typeof data.pronouns === 'string' ? data.pronouns.slice(0, 60) : '',
    connections,
    decoration: typeof data.decoration === 'string' ? data.decoration : undefined,
  };
};
