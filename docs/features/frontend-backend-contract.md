# Blackout Web ↔ Backend Contract (MVP)

This document locks the expected frontend/backend payload shapes for the web chat MVP.

## Auth

### `POST /v1/auth/login`
Request:
```json
{ "username": "string", "password": "string" }
```
Response:
```json
{ "token": "string", "user": { "id": "string", "username": "string" } }
```

### `POST /v1/auth/register`
Request/Response shape is the same as login.

## Servers / Channels

### `GET /v1/servers`
Response: `ServerSummary[]`

### `POST /v1/servers`
Request:
```json
{ "name": "string" }
```
Response: `ServerSummary`

### `GET /v1/servers/:serverId`
Response: `ServerDetails` (includes channel list)

### `POST /v1/servers/:serverId/channels`
Request:
```json
{ "name": "string" }
```
Response: `ChannelSummary`

## Messages

### `GET /v1/channels/:channelId/messages`
Response:
```json
{ "data": [ChatMessage] }
```

### `POST /v1/channels/:channelId/messages`
Request:
```json
{ "body": "string" }
```
Response: `ChatMessage`

## Realtime Gateway

Event schema:
```json
{ "type": "message.created", "eventId": "optional", "channelId": "string", "message": ChatMessage }
```

Unknown event types must be ignored by the frontend.

## Error Envelope

On non-2xx responses, backend should return:
```json
{ "code": "string", "message": "string", "details": { "optional": "metadata" } }
```

Frontend fallbacks to generic status messages if envelope is unavailable.
