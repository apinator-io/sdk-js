export interface RealtimeOptions {
  /** Region cluster ID, e.g. "us", "eu" */
  cluster: string;
  /** App key (from API key) */
  appKey: string;
  /** Auth endpoint URL for private/presence channels */
  authEndpoint?: string;
  /** Custom auth headers */
  authHeaders?: Record<string, string>;

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
