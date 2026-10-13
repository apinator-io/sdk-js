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

}

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
