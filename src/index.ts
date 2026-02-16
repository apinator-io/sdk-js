import { fetchAuth } from "./auth";
import { Channel, PresenceChannel } from "./channel";
import { Connection, type ConnectionState } from "./connection";
import type {
  EventCallback,
  Message,
  PresenceInfo,
  PresenceMemberRemovedData,
  RealtimeOptions,
} from "./types";

export class Apinator {
  private connection: Connection;
  private channels: Map<string, Channel> = new Map();
  private pendingPresenceSelf: Map<string, PresenceInfo> = new Map();
  private options: RealtimeOptions;
  private globalBindings: Map<string, Set<EventCallback>> = new Map();

  constructor(options: RealtimeOptions) {
    this.options = options;
    this.connection = new Connection(
      options,
      (msg) => this.handleMessage(msg),
      (prev, curr) => this.handleStateChange(prev, curr)
    );
  }

  /** Connect to the server. */
  connect(): this {
    this.connection.connect();
    return this;
  }

  /** Disconnect from the server. */
  disconnect(): this {
    this.connection.disconnect();
    return this;
  }

  /** Get the socket ID (available after connection). */
  get socketId(): string | null {
    return this.connection.id;
  }

  /** Get the current connection state. */
  get state(): ConnectionState {
    return this.connection.currentState;
  }

  /** Subscribe to a channel. */
  subscribe(channelName: string): Channel {
    if (this.channels.has(channelName)) {
      return this.channels.get(channelName)!;
    }

    const isPresence = channelName.startsWith("presence-");
    const channel = isPresence
      ? new PresenceChannel(channelName)
      : new Channel(channelName);

    this.channels.set(channelName, channel);

    // Listen for client events triggered via channel.trigger()
    channel.bind("__internal_trigger", (payload: unknown) => {
      const { event, data } = payload as { event: string; data: unknown };
      this.connection.send({
        event,
        channel: channelName,
        data: JSON.stringify(data),
      });
    });

    // If already connected, subscribe immediately
    if (this.connection.currentState === "connected") {
      this.sendSubscribe(channel);
    }

    return channel;
  }

  /** Unsubscribe from a channel. */
  unsubscribe(channelName: string): this {
    const channel = this.channels.get(channelName);
    if (!channel) return this;

    this.connection.send({
      event: "realtime:unsubscribe",
      data: JSON.stringify({ channel: channelName }),
    });

    this.pendingPresenceSelf.delete(channelName);
    if (channel instanceof PresenceChannel) {
      channel.clearPresenceState();
    }
    channel.unbindAll();
    this.channels.delete(channelName);
    return this;
  }

  /** Get a channel instance. */
  channel(channelName: string): Channel | undefined {
    return this.channels.get(channelName);
  }

  /** Bind to a global event (received on any channel). */
  bind(event: string, callback: EventCallback): this {
    if (!this.globalBindings.has(event)) {
      this.globalBindings.set(event, new Set());
    }
    this.globalBindings.get(event)!.add(callback);
    return this;
  }

  /** Unbind a global event. */
  unbind(event: string, callback?: EventCallback): this {
    if (!callback) {
      this.globalBindings.delete(event);
    } else {
      this.globalBindings.get(event)?.delete(callback);
    }
    return this;
  }

  /** Trigger a client event on a channel. */
  trigger(channelName: string, event: string, data: unknown): this {
    if (!event.startsWith("client-")) {
      throw new Error('Client events must be prefixed with "client-"');
    }

    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel "${channelName}" is not subscribed`);
    }
    if (!channel.subscribed) {
      throw new Error(`Channel "${channelName}" is not yet subscribed`);
    }

    channel.trigger(event, data);
    return this;
  }

  private handleMessage(msg: Message): void {
    // Fire global bindings
    const globalCbs = this.globalBindings.get(msg.event);
    if (globalCbs) {
      const parsed = this.parseData(msg.data);
      for (const cb of globalCbs) {
        try {
          cb(parsed);
        } catch {
          // Ignore
        }
      }
    }

    // Route to channel
    if (msg.channel) {
      const channel = this.channels.get(msg.channel);
      if (!channel) return;

      const data = this.parseData(msg.data);

      if (msg.event === "realtime:subscription_succeeded") {
        if (channel instanceof PresenceChannel) {
          const self = this.pendingPresenceSelf.get(msg.channel);
          channel.handleSubscribed(data, self);
          this.pendingPresenceSelf.delete(msg.channel);
        } else {
          channel.handleSubscribed(data);
        }
      } else if (msg.event === "realtime:subscription_error") {
        this.pendingPresenceSelf.delete(msg.channel);
        if (channel instanceof PresenceChannel) {
          channel.clearPresenceState();
        }
        channel.handleError(data);
      } else if (
        msg.event === "realtime:member_added" &&
        channel instanceof PresenceChannel
      ) {
        if (!isPresenceInfo(data)) {
          console.warn(
            `PresenceChannel "${channel.name}" received malformed realtime:member_added payload`,
            data
          );
          return;
        }
        channel.handleMemberAdded(data);
      } else if (
        msg.event === "realtime:member_removed" &&
        channel instanceof PresenceChannel
      ) {
        if (!isPresenceMemberRemovedData(data)) {
          console.warn(
            `PresenceChannel "${channel.name}" received malformed realtime:member_removed payload`,
            data
          );
          return;
        }
        channel.handleMemberRemoved(data);
      } else {
        channel.handleEvent(msg.event, data);
      }
    }
  }

  private handleStateChange(
    _prev: ConnectionState,
    curr: ConnectionState
  ): void {
    if (
      (_prev === "connected" && curr === "connecting") ||
      curr === "disconnected" ||
      curr === "unavailable"
    ) {
      this.clearPresenceState();
    }

    if (curr === "connected") {
      // Resubscribe to all channels
      for (const channel of this.channels.values()) {
        this.sendSubscribe(channel);
      }
    }

    // Fire state change event
    const cbs = this.globalBindings.get("state_change");
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb({ previous: _prev, current: curr });
        } catch {
          // Ignore
        }
      }
    }
  }

  private async sendSubscribe(channel: Channel): Promise<void> {
    const isPrivate = channel.name.startsWith("private-");
    const isPresence = channel.name.startsWith("presence-");

    if (isPrivate || isPresence) {
      // Need to authenticate first
      if (!this.options.authEndpoint) {
        channel.handleError({
          type: "AuthError",
          error: "No auth endpoint configured",
          status: 403,
        });
        return;
      }

      if (!this.connection.id) {
        channel.handleError({
          type: "AuthError",
          error: "Not connected",
          status: 403,
        });
        return;
      }

      try {
        const authResp = await fetchAuth(
          this.connection.id,
          channel.name,
          {
            endpoint: this.options.authEndpoint,
            headers: this.options.authHeaders,
          }
        );

        const subscribeData: Record<string, string> = {
          channel: channel.name,
          auth: authResp.auth,
        };

        if (isPresence) {
          if (!authResp.channel_data) {
            this.pendingPresenceSelf.delete(channel.name);
            channel.handleError({
              type: "AuthError",
              error: "channel_data required for presence channels",
              status: 403,
            });
            return;
          }

          const self = parsePresenceSelf(authResp.channel_data);
          if (!self) {
            this.pendingPresenceSelf.delete(channel.name);
            channel.handleError({
              type: "AuthError",
              error: "invalid channel_data",
              status: 403,
            });
            return;
          }

          this.pendingPresenceSelf.set(channel.name, self);
          subscribeData.channel_data = authResp.channel_data;
        } else if (authResp.channel_data) {
          subscribeData.channel_data = authResp.channel_data;
        }

        this.connection.send({
          event: "realtime:subscribe",
          data: JSON.stringify(subscribeData),
        });
      } catch (err) {
        this.pendingPresenceSelf.delete(channel.name);
        channel.handleError({
          type: "AuthError",
          error: String(err),
          status: 403,
        });
      }
    } else {
      // Public channel
      this.connection.send({
        event: "realtime:subscribe",
        data: JSON.stringify({ channel: channel.name }),
      });
    }
  }

  private parseData(data: string): unknown {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  private clearPresenceState(): void {
    this.pendingPresenceSelf.clear();
    for (const channel of this.channels.values()) {
      if (channel instanceof PresenceChannel) {
        channel.clearPresenceState();
      }
    }
  }
}

// Re-export types
export type { RealtimeOptions, Message, EventCallback } from "./types";
export type { ConnectionState } from "./connection";
export { Channel, PresenceChannel } from "./channel";

function parsePresenceSelf(channelData: string): PresenceInfo | null {
  try {
    const parsed = JSON.parse(channelData) as {
      user_id?: unknown;
      user_info?: unknown;
    };
    if (
      typeof parsed.user_id !== "string" ||
      parsed.user_id.length === 0 ||
      !parsed.user_info ||
      typeof parsed.user_info !== "object" ||
      Array.isArray(parsed.user_info)
    ) {
      return null;
    }
    return {
      user_id: parsed.user_id,
      user_info: parsed.user_info as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

function isPresenceInfo(data: unknown): data is PresenceInfo {
  if (!data || typeof data !== "object") return false;
  const info = data as { user_id?: unknown; user_info?: unknown };
  return (
    typeof info.user_id === "string" &&
    info.user_id.length > 0 &&
    !!info.user_info &&
    typeof info.user_info === "object" &&
    !Array.isArray(info.user_info)
  );
}

function isPresenceMemberRemovedData(
  data: unknown
): data is PresenceMemberRemovedData {
  if (!data || typeof data !== "object") return false;
  const info = data as { user_id?: unknown };
  return typeof info.user_id === "string" && info.user_id.length > 0;
}
