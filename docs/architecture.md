# Architecture

Contributor guide to the `@apinator/client` internals.

## Source Layout

```
src/
├── index.ts       — Apinator (orchestrator)
├── connection.ts  — WebSocket lifecycle + reconnection
├── channel.ts     — Channel + PresenceChannel
├── auth.ts        — Auth endpoint fetch
└── types.ts       — Shared type definitions
```

## Connection State Machine

```
initialized ──connect()──→ connecting ──onopen+established──→ connected
                                ↑                                  │
                                │                              onclose
                                │                                  ↓
                                └──reconnect delay──── connecting (retry)
                                                           │
                                         maxReconnectAttempts (if set)
                                                           ↓
                                                      unavailable

Any state ──disconnect()──→ disconnected (terminal, no reconnect)
```

## Reconnection Strategy

- Exponential backoff: `min(1000 * 2^attempt, 30000)` ms, jittered to 50–100% so clients dropped together don't reconnect in lockstep
- Retries indefinitely by default; set `maxReconnectAttempts` to give up and go `unavailable`, or `enableReconnect: false` to disable
- The attempt counter resets once the server sends `connection_established`
- On reconnect, all existing channel subscriptions are automatically re-sent

## Channel Management

`Apinator` maintains a `Map<string, Channel>` of active subscriptions.

- **Subscribe**: creates a `Channel` (or `PresenceChannel` for `presence-` prefix), stores it, and sends `realtime:subscribe` if connected.
- **Reconnect**: iterates all channels and re-sends subscribe messages.
- **Unsubscribe**: sends `realtime:unsubscribe`, removes channel from map, unbinds all callbacks.

## Authentication Flow

For `private-` and `presence-` channels:

1. Client calls `authEndpoint` via POST with `{ socket_id, channel_name }`
2. Your server validates the user and returns `{ auth: "key:signature", channel_data?: "..." }`
3. The SDK includes `auth` (and `channel_data` for presence) in the subscribe message
4. Server validates the HMAC signature

For presence channels, `me` is derived from signed `channel_data` after `realtime:subscription_succeeded` is received.

## Message Protocol

All WebSocket frames are JSON text:

```json
{"event": "event-name", "channel": "channel-name", "data": "json-string"}
```

- `data` is always a JSON-encoded string (double-encoded)
- System events use `realtime:` prefix
- Client events use `client-` prefix

## Activity Timeout / Keep-alive

1. Server sends `activity_timeout` in the connection established message; the `activityTimeout` option overrides it
2. Client starts a timer for that duration, restarted by every message from the server
3. On timeout, client sends `realtime:ping`
4. If nothing arrives within `pongTimeout` (default 30s), the socket is dropped and reconnect begins

## Design Principles

- **Zero dependencies**: uses only `WebSocket` and `fetch` browser APIs
- **Chainable API**: all mutating methods return `this`
- **Error isolation**: user callbacks are wrapped in try/catch to prevent SDK breakage
- **Idempotent subscribe**: calling `subscribe()` twice returns the same channel instance
