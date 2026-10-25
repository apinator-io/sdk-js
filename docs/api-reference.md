# API Reference

## Apinator

The main entry point for the SDK.

### Constructor

```typescript
new Apinator(options: RealtimeOptions)
```

#### RealtimeOptions

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `appKey` | `string` | Yes | — | Your application key |
| `cluster` | `string` | Yes | — | Region cluster ID (`eu`, `us`). Derives WebSocket URL as `wss://ws-{cluster}.apinator.io` |
| `authEndpoint` | `string` | No | — | URL for private/presence channel authentication |
| `authHeaders` | `Record<string, string>` | No | — | Custom headers sent with auth requests |
| `authEncoding` | `"json" \| "form"` | No | `"json"` | Auth request body encoding. `"form"` sends `application/x-www-form-urlencoded`, as pusher-js does |
| `activityTimeout` | `number` | No | server value (120) | Seconds without any server message before the client sends a ping |
| `pongTimeout` | `number` | No | `30` | Seconds to wait for a reply to that ping before reconnecting |
| `enableReconnect` | `boolean` | No | `true` | Reconnect automatically after an unexpected disconnect |
| `maxReconnectAttempts` | `number` | No | unlimited | Consecutive failed reconnects before the state becomes `unavailable` |
| `WebSocket` | `WebSocketConstructor` | No | global `WebSocket` | WebSocket implementation, e.g. the `ws` package on Node < 22: `new Apinator({ appKey, cluster, WebSocket })` |

### Methods

#### `connect(): this`

Opens the WebSocket connection. Returns the client instance for chaining.

#### `disconnect(): this`

Closes the WebSocket connection.

#### `subscribe(channelName: string): Channel`

Subscribes to a channel. Returns the `Channel` (or `PresenceChannel`) instance. If already subscribed, returns the existing instance.

- Channels prefixed with `private-` require authentication via `authEndpoint`.
- Channels prefixed with `presence-` require authentication and include member tracking.

#### `unsubscribe(channelName: string): this`

Unsubscribes from a channel and removes all its bindings.

#### `channel(channelName: string): Channel | undefined`

Returns the channel instance if subscribed, `undefined` otherwise.

#### `bind(event: string, callback: EventCallback): this`

Binds a callback to a global event (received on any channel).

#### `unbind(event: string, callback?: EventCallback): this`

Unbinds a specific callback, or all callbacks for the event if no callback is provided.

#### `trigger(channelName: string, event: string, data: unknown): this`

Triggers a client event on a private or presence channel. Event name must start with `client-`. Throws if the channel is not subscribed, not yet confirmed by the server, or is a public channel.

### Properties

#### `socketId: string | null`

The socket ID assigned by the server. Available after connection.

#### `state: ConnectionState`

Current connection state: `"initialized"` | `"connecting"` | `"connected"` | `"unavailable"` | `"disconnected"`.

---

### Connection errors

The constructor throws if `appKey` or `cluster` is missing, empty, `"undefined"` or `"null"`; a missing cluster would otherwise retry an unreachable host forever.

When the server refuses a connection for a reason retrying cannot fix, it sends `realtime:error` with a code in **4000–4099** and a message saying what to change. The client logs the message with `console.error`, passes it to `bind("realtime:error", ...)`, and moves to `disconnected` without reconnecting.

| Code | Meaning |
|------|---------|
| 4001 | App key invalid: not set, an app ID instead of a key, a placeholder, or revoked. The message says which. |
| 4003 | App disabled |
| 4010 | Wrong cluster; the message names the right one |

```js
client.bind("realtime:error", ({ code, message }) => showSetupError(message));
```

Other close codes (e.g. 4200 server restart, network drops) reconnect automatically.

Problems on the client that retrying cannot fix are reported the same way, without a `code`, and move the client to `unavailable`. A later `connect()` tries again.

| `type` | Meaning |
|--------|---------|
| `WebSocketUnavailable` | No global `WebSocket` and no `WebSocket` option (e.g. Node < 22). Install `ws` and pass it in. |
| `WebSocketError` | The WebSocket constructor threw, e.g. for a malformed URL or a CSP rule. The message includes its error. |

## Channel

Represents a subscription to a channel.

### Methods

#### `bind(event: string, callback: EventCallback): this`

Binds a callback to an event on this channel.

#### `unbind(event: string, callback?: EventCallback): this`

Unbinds a specific callback or all callbacks for the event.

#### `unbindAll(): this`

Removes all event bindings from this channel.

#### `trigger(event: string, data: unknown): this`

Triggers a client event. Only works on private/presence channels. Event name must start with `client-`.

### Properties

#### `name: string`

The channel name (read-only).

#### `subscribed: boolean`

Whether the subscription has been confirmed by the server.

### Events

| Event | Data | Description |
|-------|------|-------------|
| `realtime:subscription_succeeded` | varies | Subscription confirmed |
| `realtime:subscription_error` | `unknown` | Subscription failed. Auth errors include `{ type: "AuthError", error: string, status: number }`. |

---

## PresenceChannel

Extends `Channel` with member tracking. Created automatically when subscribing to `presence-` prefixed channels.

### Methods

#### `getMembers(): PresenceInfo[]`

Returns all current members as an array.

#### `getMember(userId: string): PresenceInfo | undefined`

Returns a specific member by user ID.

### Properties

#### `me: PresenceInfo | undefined`

The current user's presence information. This is derived from signed `channel_data` returned by your `authEndpoint`, and is set after `realtime:subscription_succeeded`.

#### `memberCount: number`

Number of currently subscribed members.

### Events

| Event | Data | Description |
|-------|------|-------------|
| `realtime:member_added` | `PresenceInfo` | A new member joined |
| `realtime:member_removed` | `{ user_id: string }` | A member left |

---

## Types

### `EventCallback`

```typescript
type EventCallback = (data: unknown) => void;
```

### `ConnectionState`

```typescript
type ConnectionState = "initialized" | "connecting" | "connected" | "unavailable" | "disconnected";
```

### `PresenceInfo`

```typescript
interface PresenceInfo {
  user_id: string;
  user_info: Record<string, unknown>;
}
```

### `AuthResponse`

```typescript
interface AuthResponse {
  auth: string;
  channel_data?: string;
}
```

### `Message`

```typescript
interface Message {
  event: string;
  channel?: string | null;
  data: string;
}
```
