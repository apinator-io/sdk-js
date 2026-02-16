# Changelog

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
