# Changelog

## [2.2.2](https://github.com/apinator-io/sdk-js/compare/v2.2.1...v2.2.2) (2026-10-17)


### Miscellaneous Chores

* release 2.2.2 ([fd6e8ee](https://github.com/apinator-io/sdk-js/commit/fd6e8eebaf855a6b137615faf28e799db1a5a8c8))

## [2.2.1](https://github.com/apinator-io/sdk-js/compare/v2.2.0...v2.2.1) (2026-10-15)


### Bug Fixes

* report the real SDK version when connecting ([#8](https://github.com/apinator-io/sdk-js/issues/8)) ([6c2b0f3](https://github.com/apinator-io/sdk-js/commit/6c2b0f323a50f3841c93bb29c15adece948390d6))

## [2.2.0](https://github.com/apinator-io/sdk-js/compare/v2.1.0...v2.2.0) (2026-10-14)


### ⚠ Behaviour change

* `new Apinator(...)` now throws if `appKey` or `cluster` is missing, empty, `"undefined"` or `"null"`. These could never connect: a missing cluster retried `ws-undefined.apinator.io` forever. The error says what to fix (for example, an environment variable that isn't set) [2b1cdb5](https://github.com/apinator-io/sdk-js/commit/2b1cdb508e69011a1fdc3fc086532f5d54e3cc55)


### Bug Fixes

* **errors:** a connection refused for a reason retrying cannot fix (any `realtime:error` or close code 4000–4099: invalid app key, app disabled, wrong cluster) now stops the client instead of reconnecting forever. Previously only 4000–4004 did [2b1cdb5](https://github.com/apinator-io/sdk-js/commit/2b1cdb508e69011a1fdc3fc086532f5d54e3cc55)
* **errors:** fatal errors now reach `bind("realtime:error", ...)`; they were dropped before the app could see them [2b1cdb5](https://github.com/apinator-io/sdk-js/commit/2b1cdb508e69011a1fdc3fc086532f5d54e3cc55)


### Features

* the server's explanation is logged as `[apinator] <message> (code N)`. With the current server it names the likely mistake: an app ID used as the key, a placeholder from an example, a revoked key, or the cluster to use [2b1cdb5](https://github.com/apinator-io/sdk-js/commit/2b1cdb508e69011a1fdc3fc086532f5d54e3cc55)

## [2.1.0](https://github.com/apinator-io/sdk-js/compare/v2.0.0...v2.1.0) (2026-10-13)


### ⚠ Behaviour change

* Reconnection is now unlimited by default; 2.0.0 gave up after 6 attempts. Set `maxReconnectAttempts` to restore a limit.


### Bug Fixes

* **reconnect:** the client never reconnected after a dropped connection. It stayed in `connecting` until the page was reloaded ([3e8e815](https://github.com/apinator-io/sdk-js/commit/3e8e81528b49ee3acef885e57280c3713596727a))
* **keep-alive:** a pong did not cancel the close timer, so every connection dropped itself about 150s after connecting. Every server message now re-arms the activity timer ([3e8e815](https://github.com/apinator-io/sdk-js/commit/3e8e81528b49ee3acef885e57280c3713596727a))
* **keep-alive:** a missed pong drops the socket and reconnects immediately instead of waiting for a dead network to report the close ([3e8e815](https://github.com/apinator-io/sdk-js/commit/3e8e81528b49ee3acef885e57280c3713596727a))
* a late `onclose` from a replaced socket (e.g. after `disconnect()` then `connect()`) no longer tears down the current connection ([3e8e815](https://github.com/apinator-io/sdk-js/commit/3e8e81528b49ee3acef885e57280c3713596727a))
* the reconnect counter resets on `connection_established` rather than raw socket open, so a server that rejects right after opening gets backoff instead of 1s retries ([3e8e815](https://github.com/apinator-io/sdk-js/commit/3e8e81528b49ee3acef885e57280c3713596727a))
* **auth:** the socket ID is cleared when the connection is lost, and an auth response signed for a replaced socket is discarded; the reconnect resubscribes with a fresh signature ([276a9b2](https://github.com/apinator-io/sdk-js/commit/276a9b2b09734963b5ae08380912451b08a99d2a))


### Features

* `activityTimeout`, `pongTimeout`, `enableReconnect` and `maxReconnectAttempts` options. These were documented before but not implemented; `activityTimeout` overrides the server's value ([3e8e815](https://github.com/apinator-io/sdk-js/commit/3e8e81528b49ee3acef885e57280c3713596727a))
* `authEncoding: "json" | "form"` option. `"form"` sends `application/x-www-form-urlencoded` auth requests, as pusher-js does; JSON remains the default ([276a9b2](https://github.com/apinator-io/sdk-js/commit/276a9b2b09734963b5ae08380912451b08a99d2a))
* reconnect delays are jittered (50–100% of the backoff) so clients dropped together don't reconnect in lockstep ([3e8e815](https://github.com/apinator-io/sdk-js/commit/3e8e81528b49ee3acef885e57280c3713596727a))

## [2.0.0](https://github.com/apinator-io/sdk-js/compare/v1.0.0...v2.0.0) (2026-02-16)


### ⚠ BREAKING CHANGES

* reset release line

### Features

* reset release line ([6dd62c7](https://github.com/apinator-io/sdk-js/commit/6dd62c76d7d18d81668d8d2bffa1039a6e16cf5f))

## 1.0.0 (2026-02-16)


### Features

* initial release ([589282c](https://github.com/apinator-io/sdk-js/commit/589282cba58be4048a727824a685c40886dd91ca))


### Bug Fixes

* update github action client name ([9f081c0](https://github.com/apinator-io/sdk-js/commit/9f081c05b7048e4da1704844447d06ff38670531))

## [1.1.2](https://github.com/apinator-io/sdk-js/compare/v1.1.1...v1.1.2) (2026-02-16)


### Bug Fixes

* incosistencies ([1403b83](https://github.com/apinator-io/sdk-js/commit/1403b83b8545088d7f119a8464a3200d0d580390))

## [1.1.1](https://github.com/apinator-io/sdk-js/compare/v1.1.0...v1.1.1) (2026-02-16)


### Bug Fixes

* updated readme ([60a881a](https://github.com/apinator-io/sdk-js/commit/60a881aea89b121b4776ce1eb1156dbcdd3b4a5f))

## [1.1.0](https://github.com/apinator-io/sdk-js/compare/v1.0.2...v1.1.0) (2026-02-16)


### Features

* added more details for devs ([e6adaef](https://github.com/apinator-io/sdk-js/commit/e6adaef12b6fbe6ba93b2cc8c35d6ce2c863e44b))

## [1.0.2](https://github.com/apinator-io/sdk-js/compare/v1.0.1...v1.0.2) (2026-02-16)


### Bug Fixes

* respect API specs ([00e4e75](https://github.com/apinator-io/sdk-js/commit/00e4e756a189d21662741c3b0c2ba1d275058009))

## [1.0.1](https://github.com/apinator-io/sdk-js/compare/v1.0.0...v1.0.1) (2026-02-15)


### Bug Fixes

* few fixes and incosistencies ([00fb974](https://github.com/apinator-io/sdk-js/commit/00fb97427ce557b5d96474c5bc82a83000feff26))

## 1.0.0 (2026-02-15)


### Features

* add lint script to package.json ([260f6d3](https://github.com/apinator-io/sdk-js/commit/260f6d31bba63defe5d24e61550c656f49c1bddd))

## [1.0.0](https://github.com/apinator/sdk-js/releases/tag/v1.0.0) (2026-02-15)

### Features

* `RealtimeClient` with connect/disconnect lifecycle
* Public channel subscriptions
* Private channel authentication via `authEndpoint`
* Presence channels with member tracking
* Client events on private/presence channels (`client-` prefix)
* Automatic reconnection with exponential backoff (max 30s)
* Activity timeout with ping/pong keep-alive
* Global event bindings across all channels
* Connection state machine (`initialized` → `connecting` → `connected` → `disconnected` / `unavailable`)
* Cluster-based URL resolution (`wss://ws-{cluster}.apinator.io`)
* TypeScript type definitions
* Dual ESM + CommonJS builds via tsup
