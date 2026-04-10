=========================================================================
Blackout Server |support| |development| |documentation| |license| |pypi| |python|
=========================================================================

Blackout Server is a Matrix homeserver distribution based on Synapse, tuned for
Blackout's signaling-first architecture.

Upstream Synapse lives at
`element-hq/synapse <https://github.com/element-hq/synapse>`_. This repository
adds Blackout-specific runtime controls, validation, metrics, and operations
playbooks for constrained and phone-hosted deployments.

.. contents::

What this fork customizes
=========================

Blackout Server keeps Synapse compatibility while enforcing a signaling-only
operating model when enabled.

Core Blackout features
----------------------

* **Signaling-only mode** via ``blackout.enabled``.
  * Accepts ``m.blackout.signal`` timeline events.
  * Rejects unsupported timeline event types during blackout mode.
* **Strict signaling schema validation** for:
  * ``ice_candidates``
  * ``sdp_offer``
  * ``sdp_answer``
  * ``message_metadata``
  * ``chunk_announcements``
* **Auto-expiry for signaling events** with ``blackout.signal_event_ttl``
  constrained to **24h-72h**.
* **Compromised-device protections**:
  * Revoked sender keys are denied for local and federated signal ingress.
* **Low-resource runtime defaults in blackout mode**:
  * search disabled
  * media repository disabled
* **Operational metrics** for acceptance/rejection, federation behavior,
  revocation enforcement, redundancy metadata quality, and purge activity.

Operational and deployment docs
-------------------------------

* Runbook: `docs/blackout-ops-runbook.md <docs/blackout-ops-runbook.md>`_
* Phase 2 implementation plan:
  `docs/blackout_phase2_pr_plan.md <docs/blackout_phase2_pr_plan.md>`_
* Parts 3-6 execution plan:
  `docs/blackout_parts3_6_execution_plan.md <docs/blackout_parts3_6_execution_plan.md>`_
* TURN/STUN setup:
  `docs/turn-howto.md <docs/turn-howto.md>`_
* Metrics guidance:
  `docs/metrics-howto.md <docs/metrics-howto.md>`_
* Railway deployment:
  `docs/railway_deploy.md <docs/railway_deploy.md>`_
* Distributed self-healing blueprint:
  `docs/distributed_self_healing_blueprint.md <docs/distributed_self_healing_blueprint.md>`_


Self-healing federation refactor blueprint
==========================================

For the full architecture package describing the migration toward a
self-healing, decentralized, encrypted, lightweight federation design (including
text architecture diagram, folder layout, event schema, CRDT example, encrypted
flow, boot/recovery sequences, and security checklist), see:

* `docs/distributed_self_healing_blueprint.md <docs/distributed_self_healing_blueprint.md>`_
* `docs/project_completion_tracker.md <docs/project_completion_tracker.md>`_

The blueprint is written to preserve compatibility with the current Synapse-based
runtime while adding a phased migration path for event-sourced replication and
phone-hosted low-memory nodes. Use the project tracker to monitor completion
status and milestone gate progress for that refactor package.

Quick start
===========

1. Install using standard Synapse methods (Docker package/debian flow preferred):
   `Synapse installation docs <https://matrix-org.github.io/synapse/latest/setup/installation.html>`_.
2. Configure your homeserver.
3. Enable blackout mode in ``homeserver.yaml``:

.. code-block:: yaml

    blackout:
      enabled: true
      signal_event_ttl: "48h"
      # optional: skip push action generation for signal events
      # skip_push_actions_for_signal: true

4. Restart the server.
5. Verify behavior:
   * ``m.blackout.signal`` accepted.
   * non-supported timeline events rejected.
   * expected blackout metrics are emitted.

Blackout mode behavior details
==============================

When blackout mode is on:

* Timeline traffic is reduced to signaling-safe patterns.
* The server applies strict payload shape validation to ``m.blackout.signal``.
* Event TTL metadata is applied so signaling content ages out automatically.
* Revoked sender keys are blocked from submitting new signaling metadata.
* Search/media-heavy features are disabled to reduce resource pressure.

Federation notes
================

Blackout controls apply to federated event ingress as well. This includes:

* validating incoming ``m.blackout.signal`` payloads,
* rejecting unsupported timeline event types, and
* enforcing revoked-device-key checks for signaling events.

If federated rejection rates rise, use the runbook's threshold and triage
guidance before broad rollback.

Phone-hosted and low-resource profile
=====================================

For constrained environments (including phone-hosted operation), baseline
recommendations are:

* ``blackout.enabled: true``
* ``blackout.signal_event_ttl: "48h"``
* keep topology and worker profile conservative
* monitor database growth and purge lag
* run regular backup + restore drills

See the runbook and TURN guide for practical caveats around battery/network
churn and NAT traversal.

Security notes
==============

General Synapse hardening still applies:

* Prefer a dedicated domain for the homeserver's ``public_baseurl``.
* Keep reverse proxy/TLS configuration tight.
* Treat content and federation endpoints as hostile-input surfaces.

References:

* `Reverse proxy docs <https://matrix-org.github.io/synapse/latest/reverse_proxy.html>`_
* `TLS certificates setup <https://matrix-org.github.io/synapse/latest/setup/installation.html#tls-certificates>`_
* `Synapse security notes <https://matrix-org.github.io/synapse/latest/>`_

Notes for AI-assisted editing
=============================

If you are using an AI tool to edit this repository, follow these guardrails:

1. **Preserve upstream compatibility assumptions** unless the task explicitly
   changes them.
2. **Do not relax blackout safety checks** (event gating, schema validation,
   revoked-key enforcement) without tests and migration notes.
3. **Keep config semantics stable**:
   * ``blackout.signal_event_ttl`` must remain bounded to 24h-72h.
   * blackout mode should continue forcing low-resource toggles.
4. **Update docs with code** whenever behavior changes:
   * ``README.rst``
   * ``docs/blackout-ops-runbook.md``
   * ``docs/metrics-howto.md``
5. **Prefer additive changes** to signaling schema and document backward
   compatibility impact.
6. **Always add/adjust tests** for any change touching:
   * event validation
   * message/federation handlers
   * key revocation logic
   * event expiry/purge
7. **Expose observability for new behavior** with explicit metric names and
   runbook troubleshooting notes.
8. **Avoid hidden behavior changes**: mention feature flags, defaults, and
   rollout/rollback steps in PR descriptions.

Contributing and support
========================

* Synapse contributor guide:
  `matrix-org.github.io/synapse/latest/development/contributing_guide.html <https://matrix-org.github.io/synapse/latest/development/contributing_guide.html>`_.
* Synapse community support room: |room|_.

.. |room| replace:: ``#synapse:matrix.org``
.. _room: https://matrix.to/#/#synapse:matrix.org

.. |docs| replace:: ``docs``
.. _docs: docs
