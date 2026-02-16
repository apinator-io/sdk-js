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
