import type {
  EventCallback,
  PresenceData,
  PresenceInfo,
  PresenceMemberRemovedData,
} from "./types";

export class Channel {
  readonly name: string;
  private bindings: Map<string, Set<EventCallback>> = new Map();
  private _subscribed = false;

  constructor(name: string) {
    this.name = name;
  }

  get subscribed(): boolean {
    return this._subscribed;
  }

  /** Bind a callback to an event on this channel. */
  bind(event: string, callback: EventCallback): this {
    if (!this.bindings.has(event)) {
      this.bindings.set(event, new Set());
    }
    this.bindings.get(event)!.add(callback);
    return this;
  }

  /** Unbind a specific callback or all callbacks for an event. */
  unbind(event: string, callback?: EventCallback): this {
    if (!callback) {
      this.bindings.delete(event);
    } else {
      this.bindings.get(event)?.delete(callback);
    }
    return this;
  }

  /** Unbind all callbacks on this channel. */
  unbindAll(): this {
    this.bindings.clear();
    return this;
  }

  /** Trigger a client event (only on private/presence channels). */
  trigger(event: string, data: unknown): this {
    if (!event.startsWith("client-")) {
      throw new Error('Client events must be prefixed with "client-"');
    }
    if (!this.name.startsWith("private-") && !this.name.startsWith("presence-")) {
      throw new Error("Client events can only be triggered on private or presence channels");
    }
    this.emit("__internal_trigger", { event, data });
    return this;
  }

  /** @internal Mark as subscribed and emit internal event. */
  handleSubscribed(data?: unknown): void {
    this._subscribed = true;
    this.emit("realtime:subscription_succeeded", data);
  }

  /** @internal Handle an incoming event. */
  handleEvent(event: string, data: unknown): void {
    this.emit(event, data);
  }

  /** @internal */
  handleError(data: unknown): void {
    this._subscribed = false;
    this.emit("realtime:subscription_error", data);
  }

  protected emit(event: string, data: unknown): void {
    const callbacks = this.bindings.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(data);
        } catch {
          // Don't let user callbacks break the SDK
        }
      }
    }
  }
}

export class PresenceChannel extends Channel {
  private presence: PresenceData["presence"] = {
    count: 0,
    ids: [],
    hash: {},
  };
  private self: PresenceInfo | null = null;

  get me(): PresenceInfo | undefined {
    return this.self ?? undefined;
  }

  get memberCount(): number {
    return this.presence.count;
  }

  /** Get all members as an array. */
  getMembers(): PresenceInfo[] {
    const members: PresenceInfo[] = [];
    for (const userId of this.presence.ids) {
      const userInfo = this.presence.hash[userId];
      if (!userInfo) {
        continue;
      }
      members.push({ user_id: userId, user_info: userInfo });
    }
    return members;
  }

  /** Get a specific member by user ID. */
  getMember(userId: string): PresenceInfo | undefined {
    const userInfo = this.presence.hash[userId];
    if (!userInfo) return undefined;
    return { user_id: userId, user_info: userInfo };
  }

  /** @internal */
  clearPresenceState(): void {
    this.presence = { count: 0, ids: [], hash: {} };
    this.self = null;
  }

  /** @internal */
  handleSubscribed(data?: unknown, self?: PresenceInfo): void {
    this.clearPresenceState();
    if (self) {
      this.self = self;
    }
    if (isPresenceData(data)) {
      const ids = Array.isArray(data.presence.ids) ? data.presence.ids : [];
      const hash = data.presence.hash ?? {};
      this.presence = {
        count: data.presence.count,
        ids: ids.filter((id): id is string => typeof id === "string"),
        hash,
      };
      // Keep count consistent with IDs when backend payload is malformed.
      this.presence.count = this.presence.ids.length;
    } else if (data != null) {
      console.warn(
        `PresenceChannel "${this.name}" received malformed presence snapshot in realtime:subscription_succeeded`,
        data
      );
    }
    super.handleSubscribed(data);
  }

  /** @internal */
  handleMemberAdded(info: PresenceInfo): void {
    if (!this.presence.ids.includes(info.user_id)) {
      this.presence.ids = [...this.presence.ids, info.user_id];
    }
    this.presence.hash = {
      ...this.presence.hash,
      [info.user_id]: info.user_info,
    };
    this.presence.count = this.presence.ids.length;
    this.emit("realtime:member_added", info);
  }

  /** @internal */
  handleMemberRemoved(info: PresenceMemberRemovedData): void {
    this.presence.ids = this.presence.ids.filter((id) => id !== info.user_id);
    const { [info.user_id]: _, ...rest } = this.presence.hash;
    this.presence.hash = rest;
    this.presence.count = this.presence.ids.length;
    this.emit("realtime:member_removed", info);
  }
}

function isPresenceData(data: unknown): data is PresenceData {
  if (!data || typeof data !== "object") return false;
  const maybePresence = (data as { presence?: unknown }).presence;
  if (!maybePresence || typeof maybePresence !== "object") return false;
  const presence = maybePresence as {
    count?: unknown;
    ids?: unknown;
    hash?: unknown;
  };
  return (
    typeof presence.count === "number" &&
    Array.isArray(presence.ids) &&
    !!presence.hash &&
    typeof presence.hash === "object"
  );
}
