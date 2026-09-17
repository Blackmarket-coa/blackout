import { Hono } from 'hono';
import { appBaseUrl, renderOgHtml, type OgFields } from './sharePreview';
import { getCoalition, getCampaign, isStopped } from '../services/coalitionNetworkStore';
import {
    campaignAppUrl,
    campaignIsPubliclyShareable,
    campaignShareUrl,
    coalitionBaseUrl,
    composePost,
} from '../services/coalitionSync';
import { recordAttributedAction } from '../services/coalitionAttribution';

/**
 * Server-rendered OpenGraph card for a coalition campaign.
 *
 * A campaign shared to X, Facebook, Discord or iMessage is fetched by a crawler
 * that reads `<meta property="og:*">` and does not run JS. Without this route
 * the link resolves to the SPA shell, whose static tags say "Blackout Client" —
 * so every campaign anyone ever shared unfurled as the same generic app card,
 * naming neither the campaign, nor the coalition, nor the goal. The link still
 * *worked*; it just never earned the click.
 *
 * Same shape as the invite preview (`sharePreview.ts`) and deliberately reusing
 * its renderer, so the two cards cannot drift.
 *
 * Mounted outside `/v1` at `/c` and also under `${root}/c` — see
 * `routes/invitations.ts` for why: some deployments' nginx only proxies
 * `/v1/*`, and a preview URL that 404s there is worse than no preview.
 */
/** Carry a `ref` onto the destination, when one came in. */
const withRef = (url: string, ref: string | undefined): string =>
    ref ? `${url}${url.includes('?') ? '&' : '?'}ref=${encodeURIComponent(ref)}` : url;

const campaignPreview = new Hono();

campaignPreview.get('/:slug/:campaignId', (c) => {
    // The one place a real click is observable. The ref rides the link a
    // crawler also fetches, so only a redirect-following request is counted —
    // `renderOgHtml` emits the redirect, and a crawler does not follow it.
    const ref = c.req.query('ref');
    // og:url must be byte-identical to the URL composePost puts in the post,
    // so both sides read the same env rather than each picking a base.
    const base = coalitionBaseUrl();
    const slug = c.req.param('slug');
    const campaignId = c.req.param('campaignId');
    const shareUrl = campaignShareUrl({ slug }, campaignId, base);
    const defaultImage = `${appBaseUrl()}/assets/favicon-48x48.png`;
    const coalitionPath = `${base}/coalitions/${encodeURIComponent(slug)}`;

    const generic: OgFields = {
        title: 'Coalitions on Blackout',
        description: 'People organising, funding and building together on Blackout.',
        image: defaultImage,
        url: shareUrl,
        redirectTo: withRef(coalitionPath, ref),
    };

    const coalition = getCoalition(slug);
    if (!coalition || isStopped(coalition)) return c.html(renderOgHtml(generic), 200);

    // No viewer: a crawler is never a member, and a preview must never reveal
    // more than a logged-out human sees at the same URL.
    const found = getCampaign(coalition.id, campaignId);
    if (!found.ok) return c.html(renderOgHtml(generic), 200);
    const campaign = found.value;

    // The same privacy rule the share sheet applies. A member who opted out of
    // public listing must not be turned into a link preview on someone else's
    // timeline, so the card degrades to the generic one and the destination
    // still works for anyone who follows it.
    if (!campaignIsPubliclyShareable(campaign)) return c.html(renderOgHtml(generic), 200);

    // Counted here rather than in the client, so a visit is recorded even for
    // someone who never loads the app. Silent on every failure.
    recordAttributedAction(ref, 'visit');

    const post = composePost(coalition, campaign, base);
    const raised = `$${(campaign.raisedCents / 100).toLocaleString()}`;
    const progress =
        campaign.goalCents && campaign.goalCents > 0
            ? `${raised} raised of $${(campaign.goalCents / 100).toLocaleString()}.`
            : `${raised} raised.`;

    return c.html(
        renderOgHtml({
            title: post.title,
            // Drop the trailing URL from the composed copy: an OG description
            // that repeats the link reads as spam to both crawlers and people.
            description: `${post.text.replace(post.url, '').trim()} ${progress}`.trim(),
            // bannerUrl is user-supplied, so trust it only when it is already
            // an http(s) URL — the same guard the invite preview applies to
            // avatars. An mxc:// or javascript: value would break the card or
            // worse.
            image:
                coalition.bannerUrl && /^https?:\/\//i.test(coalition.bannerUrl)
                    ? coalition.bannerUrl
                    : defaultImage,
            url: shareUrl,
            // Carry the ref through to the app so the visitor's own actions can
            // be credited to the share that brought them.
            redirectTo: withRef(campaignAppUrl(coalition, campaign.id, base), ref),
        }),
        200
    );
});

export default campaignPreview;
