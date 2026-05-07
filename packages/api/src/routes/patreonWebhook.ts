import { Hono } from 'hono';
import { db } from '../db/store';
import {
  normalizePatreonWebhook,
  verifyPatreonWebhook,
  type PatreonWebhookBody,
  type SupportedPatreonEvent,
  type NormalizedPatreonEvent,
} from '../integrations/patreon/webhookEvents';
import { toWidgetAlertFromPatreon } from '../integrations/widgets/streamlabsShape';
import { publish as publishWidgetAlert } from '../services/widgetBus';
import { log } from '../telemetry/logger';

/**
 * HTTP transport for Patreon webhook deliveries (Phase 1 / Track A).
 *
 * Like the Twitch EventSub receiver, this route deliberately does NOT
 * sit behind the per-user JWT middleware: Patreon's servers originate
 * the requests and there is no Blackout user session on the connection.
 * Authentication is the HMAC-MD5 signature against the per-webhook
 * secret read from `PATREON_WEBHOOK_SECRET`.
 *
 * Routing-to-creator works backwards from the campaign owner id Patreon
 * embeds in the body: we look up the linked_accounts row whose provider
 * is 'patreon' and whose providerUserId matches, and publish the
 * normalized event into THAT Blackout user's widget bus.
 *
 * Construct the route via {@link buildPatreonWebhookRoute} when you
 * need to inject a custom secret resolver / handler in tests; in
 * production the default exports a router that reads the env directly
 * and forwards to widgetBus.
 */

export interface PatreonWebhookRouteOptions {
  /** Returns the per-webhook secret. Default: PATREON_WEBHOOK_SECRET env. */
  secretResolver?: () => string | undefined;
  /**
   * Called after successful verification + normalization. If omitted,
   * falls back to the default forwarder which finds the Blackout
   * creator by linked-Patreon-account and publishes to widgetBus.
   */
  onEvent?: (event: NormalizedPatreonEvent, raw: PatreonWebhookBody) => void | Promise<void>;
}

const defaultSecretResolver = (): string | undefined =>
  process.env.PATREON_WEBHOOK_SECRET?.trim() || undefined;

/**
 * Default forwarder. Looks up the Blackout user for this Patreon
 * campaign by walking linked accounts (small map; O(n) is fine), maps
 * the event into the Streamlabs `donation` envelope, and publishes.
 */
export const defaultPatreonForwarder = (
  event: NormalizedPatreonEvent,
): void => {
  const linkedAccountsForCampaign = [...db.linkedAccounts.values()].find(
    (row) =>
      row.provider === 'patreon' && row.providerUserId === event.campaignUserId,
  );
  if (!linkedAccountsForCampaign) {
    log.info('patreon_webhook_no_linked_creator', {
      campaignUserId: event.campaignUserId,
      eventType: event.kind,
    });
    return;
  }
  const alert = toWidgetAlertFromPatreon(event);
  if (!alert) {
    // Cancellations have no Streamlabs equivalent; that's expected.
    log.info('patreon_webhook_no_streamlabs_mapping', {
      eventType: event.kind,
      campaignUserId: event.campaignUserId,
    });
    return;
  }
  const result = publishWidgetAlert(linkedAccountsForCampaign.blackoutUserId, alert);
  log.info('patreon_webhook_forwarded', {
    eventType: event.kind,
    campaignUserId: event.campaignUserId,
    delivered: result.delivered,
  });
};

export const buildPatreonWebhookRoute = (
  options: PatreonWebhookRouteOptions = {},
): Hono => {
  const router = new Hono();
  const secretResolver = options.secretResolver ?? defaultSecretResolver;
  const onEvent = options.onEvent ?? defaultPatreonForwarder;

  router.post('/', async (c) => {
    const rawBody = await c.req.text();
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(c.req.header())) {
      headers[key.toLowerCase()] = value;
    }
    const secret = secretResolver();
    if (!secret) {
      log.warn('patreon_webhook_no_secret_configured');
      // Match the Twitch handler's policy: 503 on operator misconfig (so
      // Patreon retries while we fix it), 403 on signature mismatch
      // (Patreon should never retry forged deliveries).
      return c.json(
        { code: 'patreon_webhook_misconfigured', message: 'PATREON_WEBHOOK_SECRET is not set.' },
        503,
      );
    }

    const verified = verifyPatreonWebhook({ headers, rawBody, secret });
    if (verified.kind === 'unsupported_event') {
      // 200 so Patreon doesn't retry — we just don't act on this event.
      log.info('patreon_webhook_unsupported_event', { received: verified.received });
      return c.json({ ok: true });
    }
    if (verified.kind !== 'ok') {
      log.warn('patreon_webhook_rejected', { kind: verified.kind });
      return c.json({ code: verified.kind }, 403);
    }

    let parsed: PatreonWebhookBody;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return c.json({ code: 'invalid_json' }, 400);
    }

    const normalized = normalizePatreonWebhook(verified.event as SupportedPatreonEvent, parsed);
    if (!normalized) {
      log.info('patreon_webhook_unnormalizable', { eventType: verified.event });
      return c.json({ ok: true });
    }
    try {
      await onEvent(normalized, parsed);
    } catch (err) {
      log.warn('patreon_webhook_handler_threw', { error: String(err) });
    }
    return c.json({ ok: true });
  });

  return router;
};

export default buildPatreonWebhookRoute();
