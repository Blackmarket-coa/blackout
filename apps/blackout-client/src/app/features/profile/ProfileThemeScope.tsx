import React, { useMemo, type CSSProperties, type ReactNode } from 'react';
import type { ProfileCustomTheme, ProfileThemeTokenKey } from './profileTypes';
import { sanitizeProfileThemeTokenValue } from './profileTypes';

export interface ProfileThemeScopeProps {
    /** Stable profile id (Matrix user id). Used to scope the style block. */
    profileId: string;
    theme?: ProfileCustomTheme;
    children: ReactNode;
}

/** Map a token key to the CSS custom property it overrides. */
const TOKEN_TO_VAR: Record<ProfileThemeTokenKey, string> = {
    accent: '--accent-primary',
    panelBg: '--bg-surface',
    panelFg: '--text-primary',
    headerBg: '--bg-input',
    linkColor: '--link-color',
    fontFamily: '--font-family-base',
};

function escapeCssIdentifier(value: string): string {
    // Profile ids contain '@' and ':'; CSS attribute selectors handle them, but
    // we still strip anything that could close the attribute selector.
    return value.replace(/["\\]/g, '\\$&');
}

function buildScopedRule(profileId: string, tokens: ProfileCustomTheme['tokens']): string {
    if (!tokens) return '';
    const decls: string[] = [];
    for (const key of Object.keys(tokens) as ProfileThemeTokenKey[]) {
        const raw = tokens[key];
        if (raw === undefined) continue;
        // Defense in depth: re-validate on render. The sanitizer is the
        // primary boundary; this catches malformed payloads that bypass it.
        const validated = sanitizeProfileThemeTokenValue(key, raw);
        if (validated === null) continue;
        decls.push(`${TOKEN_TO_VAR[key]}: ${validated};`);
    }
    if (decls.length === 0) return '';
    const selector = `[data-profile-id="${escapeCssIdentifier(profileId)}"]`;
    return `${selector} { ${decls.join(' ')} }`;
}

const wrapperStyle: CSSProperties = { display: 'contents' };

/**
 * Scope per-profile theme overrides to the wrapped subtree only. The injected
 * style block targets a [data-profile-id] selector so other surfaces in the
 * app are unaffected. Constrained tokens only — no raw CSS path.
 */
export function ProfileThemeScope({ profileId, theme, children }: ProfileThemeScopeProps) {
    const css = useMemo(() => buildScopedRule(profileId, theme?.tokens), [profileId, theme?.tokens]);

    return (
        <div data-profile-id={profileId} style={wrapperStyle}>
            {css ? <style data-testid="profile-theme-scope">{css}</style> : null}
            {children}
        </div>
    );
}

export default ProfileThemeScope;
