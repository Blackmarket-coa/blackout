import { Hono } from 'hono';
import { previewInvitation, resolvePersonalRegistrationToken } from '../services/invitations';
import { getProfile } from '../services/profileStore';

/**
 * Public, server-rendered Open Graph landing page for share links. Social
 * crawlers (TikTok/Instagram/Discord/X) fetch the URL's HTML and read
 * `<meta property="og:*">` — they do NOT run JS — so the SPA route at
 * `/invite/:token` can't produce a preview. This endpoint returns real meta
 * tags and then redirects humans into the SPA invite flow.
 *
 * Mounted at the top level (`/i`), outside `/v1`, so it is unauthenticated.
 */
const share = new Hono();

const appBaseUrl = (): string =>
  (process.env.PUBLIC_APP_URL ?? 'http://localhost:8080').replace(/\/+$/, '');

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const httpAvatarFor = (inviterId: string): string | null => {
  // Profiles may be keyed by either id space depending on the surface; try the
  // raw id and only trust an already-HTTP(S) avatar (no mxc resolution here).
  const profile = getProfile(inviterId);
  const url = profile?.avatarUrl;
  return url && /^https?:\/\//i.test(url) ? url : null;
};

interface OgFields {
  title: string;
  description: string;
  image: string;
  url: string;
  redirectTo: string;
}

const renderOgHtml = (f: OgFields): string => {
  const title = escapeHtml(f.title);
  const description = escapeHtml(f.description);
  const image = escapeHtml(f.image);
  const url = escapeHtml(f.url);
  const redirectTo = escapeHtml(f.redirectTo);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Blackout" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:url" content="${url}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />
<meta http-equiv="refresh" content="0; url=${redirectTo}" />
<link rel="canonical" href="${redirectTo}" />
</head>
<body>
<p>Redirecting to <a href="${redirectTo}">Blackout</a>…</p>
<script>location.replace(${JSON.stringify(f.redirectTo)});</script>
</body>
</html>`;
};

share.get('/:token', (c) => {
  const token = c.req.param('token');
  const base = appBaseUrl();
  // Carry the registration token through to the SPA register flow in the URL
  // fragment (preserved by the meta-refresh + location.replace below; ignored
  // by crawlers). Only personal links expose it — see resolvePersonalRegistrationToken.
  const regToken = resolvePersonalRegistrationToken(token);
  const invitePath = `${base}/invite/${encodeURIComponent(token)}`;
  const redirectTo = regToken
    ? `${invitePath}#registrationToken=${encodeURIComponent(regToken)}`
    : invitePath;
  const shareUrl = `${base}/v1/i/${encodeURIComponent(token)}`;
  const defaultImage = `${base}/assets/favicon-48x48.png`;

  const outcome = previewInvitation(token);
  const fields: OgFields =
    outcome.kind === 'ok'
      ? {
          title: `Join ${outcome.inviter.username} on Blackout`,
          description: `${outcome.inviter.username} invited you to create an account and connect on Blackout.`,
          image: httpAvatarFor(outcome.inviter.id) ?? defaultImage,
          url: shareUrl,
          redirectTo,
        }
      : {
          title: 'Join me on Blackout',
          description: 'Create your account and connect on Blackout.',
          image: defaultImage,
          url: shareUrl,
          redirectTo,
        };

  // Always 200 so crawlers render a card even for an expired/invalid token;
  // the SPA invite page handles the invalid state for humans after redirect.
  return c.html(renderOgHtml(fields), 200);
});

export default share;
