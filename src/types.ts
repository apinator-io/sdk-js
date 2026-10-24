export interface RealtimeOptions {
  /** Region cluster ID, e.g. "us", "eu" */
  cluster: string;
  /** App key (from API key) */
  appKey: string;
  /** Auth endpoint URL for private/presence channels */
  authEndpoint?: string;
  /** Custom auth headers */
  authHeaders?: Record<string, string>;
  /**
   * Body encoding for auth requests: `"json"` (default) or `"form"`
   * (`application/x-www-form-urlencoded`, as pusher-js sends).
   */
  authEncoding?: "json" | "form";
  /**
   * Seconds without any message from the server before the client sends a
   * ping to check the connection. Defaults to the server-provided value (120s).
   */
  activityTimeout?: number;
  /** Seconds to wait for a pong before treating the connection as dead. Default 30. */
  pongTimeout?: number;
  /** Reconnect automatically after an unexpected disconnect. Default true. */
  enableReconnect?: boolean;
  /**
   * Consecutive failed reconnect attempts before giving up and moving to
   * `unavailable`. Default: unlimited.
   */
  maxReconnectAttempts?: number;
  /**
   * WebSocket implementation to connect with. Defaults to the global
   * `WebSocket` (browsers, Node 22+, Deno, Bun). Where there is none, such as
   * Node < 22, pass one: `import WebSocket from "ws"` then
   * `new Apinator({ ..., WebSocket })`.
   */
  WebSocket?: WebSocketConstructor;
}

/**
 * Handler type checked bivariantly, so implementations whose event types are
 * richer than the SDK needs (the DOM's `MessageEvent`, `ws`'s events) fit.
 */
type Handler<E> = { bivarianceHack(event: E): void }["bivarianceHack"];

/** The part of a WebSocket the SDK uses. The DOM `WebSocket` and `ws` both satisfy it. */
export interface WebSocketLike {
  readonly readyState: number;
  onmessage: Handler<{ data: unknown }> | null;
  onclose: Handler<{ code: number }> | null;
  onerror: Handler<unknown> | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/** A WebSocket constructor, e.g. the global `WebSocket` or the `ws` package's default export. */
export type WebSocketConstructor = new (url: string) => WebSocketLike;

export interface Message {
  event: string;
  channel?: string | null;
  data: string;
}

export interface ConnectionEstablishedData {
  socket_id: string;
  activity_timeout: number;
}

export interface SubscribeData {
  channel: string;
  auth?: string;
  channel_data?: string;
}

export interface PresenceInfo {
  user_id: string;
  user_info: Record<string, unknown>;
}

export interface PresenceData {
  presence: {
    count: number;
    ids: string[];
    hash: Record<string, Record<string, unknown>>;
  };
}

export interface PresenceMemberRemovedData {
  user_id: string;
}

export type EventCallback = (data: unknown) => void;

export interface AuthResponse {
  auth: string;
  channel_data?: string;
}
