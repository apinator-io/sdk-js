# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm run build            # tsup → dual ESM + CJS output in dist/
npm run test             # vitest run (all tests)
npm run test:watch       # vitest in watch mode
npm run test:coverage    # vitest with v8 coverage (85% threshold on statements/branches/functions/lines)
npm run lint             # tsc --noEmit (type checking only, no separate linter)
npm run typecheck        # alias for lint
```

Run a single test file: `npx vitest run test/channel.test.ts`

## Architecture

Browser-only WebSocket client SDK (`@apinator/client`) for the Apinator real-time messaging platform. Zero runtime dependencies — only dev deps (tsup, typescript, vitest).

### Source Files (`src/`)

- **`index.ts`** — `RealtimeClient`: main entry point. Owns the `Connection`, a `Map<string, Channel>` of subscriptions, and global event bindings. Routes incoming messages to the correct channel. Handles auth flow for private/presence channels via `fetchAuth`, including `pendingPresenceSelf` tracking for presence self-identity.
- **`connection.ts`** — `Connection`: WebSocket lifecycle (connect, disconnect, reconnect with exponential backoff capped at 30s). Manages connection state machine (`initialized → connecting → connected → disconnected/unavailable`). Sends `realtime:ping` on activity timeout, closes socket if no pong within 30s.
- **`channel.ts`** — `Channel` and `PresenceChannel`. Channel holds event bindings and subscription state. PresenceChannel extends Channel with member tracking (`presence.ids`, `presence.hash`, `presence.count`) and `me`/`getMembers()`/`getMember()` accessors.
- **`auth.ts`** — `fetchAuth()`: POSTs `{ socket_id, channel_name }` to the user's auth endpoint, returns `{ auth, channel_data? }`.
- **`types.ts`** — All shared interfaces (`RealtimeOptions`, `Message`, `PresenceInfo`, `AuthResponse`, etc.).

### Message Protocol

JSON text frames: `{"event": "...", "channel": "...", "data": "..."}`. System events use `realtime:` prefix, client events use `client-` prefix. Client events can only be triggered on private/presence channels.

### Channel Types

- **Public** — no prefix, no auth required
- **Private** (`private-` prefix) — HMAC auth via auth endpoint
- **Presence** (`presence-` prefix) — HMAC auth + `channel_data` (JSON with `user_id` + `user_info`)

### Connection State Machine

`initialized → connecting → connected` (normal flow). On disconnect: reconnects with exponential backoff (max 6 attempts, default). After max attempts: `unavailable`. On reconnect, all channels are resubscribed. Presence state is cleared on disconnect/reconnect.

### Key Design Patterns

- `RealtimeClient` uses an `__internal_trigger` event binding on channels to intercept `channel.trigger()` calls and forward them through the connection.
- Presence self-identity is stored in `pendingPresenceSelf` between auth response and subscription success, then passed to `PresenceChannel.handleSubscribed()`.
- All user callback errors are silently caught to prevent SDK breakage.
