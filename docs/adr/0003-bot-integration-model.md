# ADR 0003: Bot & integration model — appservices over an in-app bot framework

## Status

Accepted

## Context

The Discord comparative analysis (`docs/audits/discord-comparative-analysis-2026-05-27.md`)
flagged "generic in-app bot framework" as Absent relative to Discord, which exposes a first-class
bot/application API (gateway intents, slash-command registration, interaction callbacks).

Blackout already provides two integration surfaces:

- **Discord-compatible incoming webhooks** (`packages/api/src/services/discordCompatWebhooks.ts`,
  routes at `/discord-compat/webhooks/:id/:token`) — existing Discord-webhook tooling (GitHub,
  Sentry, Grafana, IFTTT, Zapier, …) posts to Blackout rooms by swapping the URL.
- **Matrix appservices** — the standard Matrix mechanism for privileged automation. The repo
  already runs appservices for moderation (Draupnir/Mjolnir) and bridging
  (`deploy/docker/blackout-backend/integrations/mautrix-discord/`).

The question is whether to build a bespoke in-client bot framework to "match" Discord, or to lean
on the appservice model that Matrix already standardizes.

## Decision

- **Do not build a bespoke in-app bot framework.** Treat Matrix appservices as the supported
  mechanism for bots and privileged automation.
- Keep and extend the **Discord-compatible webhook** surface for inbound, low-privilege,
  fire-and-forget integrations.
- Document the appservice path (registration into Synapse, capability scoping) as the recommended
  way to add bot-like behavior, reusing the existing mautrix/Draupnir runbooks as templates.

## Consequences

- Bots run as appservices with explicit, auditable Synapse registrations rather than ambient
  in-client credentials — better aligned with Blackout's E2EE and least-privilege posture.
- Integration coverage for the common "post to a channel" case is already met by webhooks; richer
  automation uses the appservice API without new framework surface area to maintain.
- We accept a deliberate non-goal: Blackout will not ship a Discord-style slash-command/interaction
  registration API in the client in the near term.

## Tradeoffs

- Higher setup friction for simple bots than Discord's hosted bot API (appservices require
  homeserver-side registration).
- Third-party bot ecosystems built specifically against Discord's gateway will not run unmodified;
  they integrate via webhooks or a bridge instead.

## Reversal conditions

Revisit this decision if any of the following hold:

1. Sustained demand for in-room interactive bots (buttons/slash commands) that webhooks +
   appservices cannot reasonably serve.
2. A Matrix-native interactions standard (e.g. an accepted MSC for message components/commands)
   matures enough to implement against.
3. Operator feedback shows appservice registration friction is blocking legitimate integrations at
   scale.
