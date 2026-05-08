# companion-module-blackout

Bitfocus Companion module for the Blackmarket Coalition Blackout API.

The Blackout API ships an OBS-WebSocket v5 protocol-compatible shim at
`<scheme>://<api-host>:<port>/obs-ws/<password-id>`
(`packages/api/src/integrations/obs-ws-compat/`). Because the shim
speaks the real OBS-WS protocol, this module just wraps the standard
`obs-websocket-js` client — no custom auth code lives here.

## Why use this instead of the OBS module?

The Blackout shim runs as part of the Blackout API and exposes
**Blackout-specific** controls in addition to OBS's standard request
matrix:

- `StartStream` / `StopStream` / `ToggleStream` operate on the Blackout
  stream session model (the same one the Blackout web UI drives).
- `SetInputMute` for the OBS inputs `Mic` / `Microphone` /
  `Desktop Audio` is wired through to the creator's LiveKit voice room
  via the LiveKit Server SDK admin token, so muting from a Stream Deck
  also mutes their voice in their canopy.
- `BroadcastCustomEvent` events with `eventType` `blackout.tip`,
  `blackout.follow`, etc. are pushed automatically — Companion
  feedbacks blink without polling.

## Install

### From the Blackout monorepo (development)

```sh
cd packages/companion-blackout
pnpm install
pnpm run build
```

Then sideload into Companion via the developer module loader (point
at `packages/companion-blackout/`).

### From the Bitfocus Companion module store

This module is targeting an upstream PR to
[`bitfocus/companion`](https://github.com/bitfocus/companion). Once
accepted it will appear in the in-app module list as
**Blackmarket Coalition Blackout**.

## Configure

In Companion → Add new → search for `Blackout`. Fill in:

| Field | Notes |
|---|---|
| **Blackout API host** | Hostname only, no scheme. e.g. `api.blackmarket.example`. |
| **Port** | Default `3000`. |
| **Scheme** | `wss` for production TLS, `ws` for clear-text dev. |
| **OBS-WS password id** | The slug after `/obs-ws/` in the connection URL. Generate in the Blackout web UI under **Settings → OBS WebSocket passwords**. |
| **OBS-WS password** | The plaintext password from the **one-time** reveal dialog when you create the password row. Lose it = you have to create a new password. |

## Actions

| id | Wire request | Notes |
|---|---|---|
| `start_stream` | `StartStream` | Idempotent; returns the existing session if one's open. |
| `stop_stream` | `StopStream` | Ends every open session for the creator. |
| `toggle_stream` | `ToggleStream` | Convenience for a single-button toggle. |
| `set_scene` | `SetCurrentProgramScene` | Default scene options are `Live` and `Offline` (the shim exposes two virtual scenes). |
| `toggle_mute` | `ToggleInputMute` | Hardcoded `Mic` / `Microphone` / `Desktop Audio` inputs map to LiveKit. Other names return NotImplemented. |

## Feedbacks

| id | Trigger |
|---|---|
| `streaming` | Background turns red while the Blackout shim reports an active stream session. |

## Variables

| id | Description |
|---|---|
| `$(blackout:is_streaming)` | `true` / `false`. |
| `$(blackout:current_scene)` | Current OBS program scene name. |
| `$(blackout:last_tip_amount)` | Numeric — populated by `blackout.tip` push events. |
| `$(blackout:last_follow_name)` | Populated by `blackout.follow` push events. |

## License

MIT — same as Companion modules generally.
