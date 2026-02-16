import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Apinator } from "../src/index";
import { Channel, PresenceChannel } from "../src/channel";
import type { Message } from "../src/types";

// Minimal MockWebSocket for client-level tests
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  simulateMessage(msg: Message) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  simulateConnectionEstablished(socketId = "sock.123") {
    this.onopen?.();
    this.simulateMessage({
      event: "realtime:connection_established",
      data: JSON.stringify({ socket_id: socketId, activity_timeout: 120 }),
    });
  }
}

describe("Apinator", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.useFakeTimers();
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function createClient(overrides = {}) {
    return new Apinator({
      appKey: "test-key",
      cluster: "eu",
      ...overrides,
    });
  }

  function ws() {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  function sentMessages(): Record<string, unknown>[] {
    return ws().sent.map((s) => JSON.parse(s));
  }

  it("starts in initialized state", () => {
    const client = createClient();
    expect(client.state).toBe("initialized");
    expect(client.socketId).toBeNull();
  });

  it("connect returns this for chaining", () => {
    const client = createClient();
    expect(client.connect()).toBe(client);
  });

  it("disconnect returns this for chaining", () => {
    const client = createClient();
    client.connect();
    expect(client.disconnect()).toBe(client);
  });

  describe("subscribe", () => {
    it("returns a Channel for public channels", () => {
      const client = createClient();
      const ch = client.subscribe("my-channel");
      expect(ch).toBeInstanceOf(Channel);
      expect(ch.name).toBe("my-channel");
    });

    it("returns a PresenceChannel for presence- prefix", () => {
      const client = createClient();
      const ch = client.subscribe("presence-room");
      expect(ch).toBeInstanceOf(PresenceChannel);
    });

    it("returns same instance on duplicate subscribe", () => {
      const client = createClient();
      const ch1 = client.subscribe("ch");
      const ch2 = client.subscribe("ch");
      expect(ch1).toBe(ch2);
    });

    it("sends subscribe message when already connected", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();

      client.subscribe("my-channel");

      const msgs = sentMessages();
      const sub = msgs.find(
        (m) => m.event === "realtime:subscribe"
      );
      expect(sub).toBeDefined();
      const data = JSON.parse(sub!.data as string);
      expect(data.channel).toBe("my-channel");
    });

    it("subscribes channels that were added before connect", () => {
      const client = createClient();
      client.subscribe("ch1");
      client.subscribe("ch2");

      client.connect();
      ws().simulateConnectionEstablished();

      const msgs = sentMessages();
      const subs = msgs.filter((m) => m.event === "realtime:subscribe");
      const channels = subs.map((s) => JSON.parse(s.data as string).channel);
      expect(channels).toContain("ch1");
      expect(channels).toContain("ch2");
    });
  });

  describe("unsubscribe", () => {
    it("sends unsubscribe message and removes channel", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();
      client.subscribe("ch");
      ws().sent = [];

      client.unsubscribe("ch");

      const msgs = sentMessages();
      expect(msgs[0].event).toBe("realtime:unsubscribe");
      expect(client.channel("ch")).toBeUndefined();
    });

    it("returns this for chaining", () => {
      const client = createClient();
      expect(client.unsubscribe("nonexistent")).toBe(client);
    });

    it("is a no-op for unknown channels", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();
      ws().sent = [];
      client.unsubscribe("nonexistent");
      expect(ws().sent).toHaveLength(0);
    });
  });

  describe("channel", () => {
    it("returns the channel if subscribed", () => {
      const client = createClient();
      const ch = client.subscribe("ch");
      expect(client.channel("ch")).toBe(ch);
    });

    it("returns undefined for unknown channels", () => {
      const client = createClient();
      expect(client.channel("unknown")).toBeUndefined();
    });
  });

  describe("message routing", () => {
    it("routes events to the correct channel", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();

      const ch = client.subscribe("chat");
      const cb = vi.fn();
      ch.bind("new-msg", cb);

      ws().simulateMessage({
        event: "new-msg",
        channel: "chat",
        data: '{"text":"hi"}',
      });

      expect(cb).toHaveBeenCalledWith({ text: "hi" });
    });

    it("handles subscription_succeeded", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();

      const ch = client.subscribe("chat");

      ws().simulateMessage({
        event: "realtime:subscription_succeeded",
        channel: "chat",
        data: "{}",
      });

      expect(ch.subscribed).toBe(true);
    });

    it("handles subscription_error", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();

      const ch = client.subscribe("chat");
      const cb = vi.fn();
      ch.bind("realtime:subscription_error", cb);

      ws().simulateMessage({
        event: "realtime:subscription_error",
        channel: "chat",
        data: JSON.stringify({ type: "AuthError", error: "denied" }),
      });

      expect(ch.subscribed).toBe(false);
      expect(cb).toHaveBeenCalled();
    });

    it("routes member_added to presence channels", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();

      const ch = client.subscribe("presence-room") as PresenceChannel;
      const cb = vi.fn();
      ch.bind("realtime:member_added", cb);

      ws().simulateMessage({
        event: "realtime:member_added",
        channel: "presence-room",
        data: JSON.stringify({ user_id: "1", user_info: { name: "Alice" } }),
      });

      expect(cb).toHaveBeenCalled();
      expect(ch.memberCount).toBe(1);
    });

    it("ignores malformed member_added payloads on presence channels", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();

      const ch = client.subscribe("presence-room") as PresenceChannel;
      const cb = vi.fn();
      ch.bind("realtime:member_added", cb);

      ws().simulateMessage({
        event: "realtime:member_added",
        channel: "presence-room",
        data: JSON.stringify({ user_id: 1, user_info: { name: "Alice" } }),
      });

      expect(cb).not.toHaveBeenCalled();
      expect(ch.memberCount).toBe(0);
      expect(warn).toHaveBeenCalled();
    });

    it("routes member_removed to presence channels", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();

      const ch = client.subscribe("presence-room") as PresenceChannel;
      ch.handleMemberAdded({ user_id: "1", user_info: { name: "Alice" } });

      ws().simulateMessage({
        event: "realtime:member_removed",
        channel: "presence-room",
        data: JSON.stringify({ user_id: "1" }),
      });

      expect(ch.memberCount).toBe(0);
    });

    it("ignores malformed member_removed payloads on presence channels", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();

      const ch = client.subscribe("presence-room") as PresenceChannel;
      ch.handleMemberAdded({ user_id: "1", user_info: { name: "Alice" } });
      const cb = vi.fn();
      ch.bind("realtime:member_removed", cb);

      ws().simulateMessage({
        event: "realtime:member_removed",
        channel: "presence-room",
        data: JSON.stringify({ user_id: 1 }),
      });

      expect(cb).not.toHaveBeenCalled();
      expect(ch.memberCount).toBe(1);
      expect(warn).toHaveBeenCalled();
    });

    it("ignores events for unknown channels", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();

      // Should not throw
      ws().simulateMessage({
        event: "msg",
        channel: "unknown-ch",
        data: '{}',
      });
    });

    it("parses non-JSON data as raw string", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();

      const ch = client.subscribe("chat");
      const cb = vi.fn();
      ch.bind("raw-event", cb);

      ws().simulateMessage({
        event: "raw-event",
        channel: "chat",
        data: "plain text",
      });

      expect(cb).toHaveBeenCalledWith("plain text");
    });
  });

  describe("global bindings", () => {
    it("fires global callbacks for any channel event", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();

      const cb = vi.fn();
      client.bind("my-event", cb);
      client.subscribe("ch");

      ws().simulateMessage({
        event: "my-event",
        channel: "ch",
        data: '{"x":1}',
      });

      expect(cb).toHaveBeenCalledWith({ x: 1 });
    });

    it("fires state_change binding", () => {
      const client = createClient();
      const cb = vi.fn();
      client.bind("state_change", cb);
      client.connect();

      expect(cb).toHaveBeenCalledWith({
        previous: "initialized",
        current: "connecting",
      });
    });

    it("unbind removes specific callback", () => {
      const client = createClient();
      const cb = vi.fn();
      client.bind("ev", cb);
      client.unbind("ev", cb);
      client.connect();
      ws().simulateConnectionEstablished();

      ws().simulateMessage({ event: "ev", data: '{}' });
      expect(cb).not.toHaveBeenCalled();
    });

    it("unbind without callback removes all for event", () => {
      const client = createClient();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      client.bind("ev", cb1);
      client.bind("ev", cb2);
      client.unbind("ev");
      client.connect();
      ws().simulateConnectionEstablished();

      ws().simulateMessage({ event: "ev", data: '{}' });
      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
    });

    it("bind returns this for chaining", () => {
      const client = createClient();
      expect(client.bind("e", () => {})).toBe(client);
    });

    it("unbind returns this for chaining", () => {
      const client = createClient();
      expect(client.unbind("e")).toBe(client);
    });

    it("global callback errors don't break message routing", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();

      client.bind("ev", () => {
        throw new Error("boom");
      });
      client.subscribe("ch");
      const cb = vi.fn();
      client.channel("ch")!.bind("ev", cb);

      ws().simulateMessage({ event: "ev", channel: "ch", data: '{}' });
      expect(cb).toHaveBeenCalled();
    });
  });

  describe("trigger", () => {
    it("sends client event over WebSocket for subscribed private channels", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();
      const ch = client.subscribe("private-ch");
      ch.handleSubscribed();

      ws().sent = [];
      client.trigger("private-ch", "client-typing", { user: "alice" });

      const msgs = sentMessages();
      expect(msgs[0]).toEqual({
        event: "client-typing",
        channel: "private-ch",
        data: JSON.stringify({ user: "alice" }),
      });
    });

    it("throws if event lacks client- prefix", () => {
      const client = createClient();
      expect(() => client.trigger("ch", "bad-event", {})).toThrow("client-");
    });

    it("throws when channel is not subscribed in client registry", () => {
      const client = createClient();
      expect(() => client.trigger("private-ch", "client-ev", {})).toThrow(
        "is not subscribed"
      );
    });

    it("throws when channel exists but subscription is not yet confirmed", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();
      client.subscribe("private-ch");

      expect(() => client.trigger("private-ch", "client-ev", {})).toThrow(
        "not yet subscribed"
      );
    });

    it("throws when channel is public", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();
      client.subscribe("public-ch");
      ws().simulateMessage({
        event: "realtime:subscription_succeeded",
        channel: "public-ch",
        data: "{}",
      });

      expect(() => client.trigger("public-ch", "client-ev", {})).toThrow(
        "private or presence"
      );
    });

    it("returns this for chaining", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();
      const ch = client.subscribe("private-ch");
      ch.handleSubscribed();
      expect(client.trigger("private-ch", "client-ev", {})).toBe(client);
    });

    it("channel.trigger() sends event over WebSocket", () => {
      const client = createClient();
      client.connect();
      ws().simulateConnectionEstablished();

      const ch = client.subscribe("private-ch");
      ws().sent = [];

      ch.trigger("client-typing", { user: "alice" });

      const msgs = sentMessages();
      expect(msgs[0]).toEqual({
        event: "client-typing",
        channel: "private-ch",
        data: JSON.stringify({ user: "alice" }),
      });
    });
  });

  describe("private channel auth", () => {
    it("authenticates private channels via authEndpoint", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ auth: "key:sig" }),
      });

      const client = createClient({
        authEndpoint: "/auth",
      });
      client.connect();
      ws().simulateConnectionEstablished();
      ws().sent = [];

      client.subscribe("private-orders");

      // Wait for async auth
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledWith("/auth", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          socket_id: "sock.123",
          channel_name: "private-orders",
        }),
      }));

      const msgs = sentMessages();
      const sub = msgs.find((m) => m.event === "realtime:subscribe");
      const data = JSON.parse(sub!.data as string);
      expect(data.auth).toBe("key:sig");
      expect(data.channel).toBe("private-orders");
    });

    it("includes channel_data for presence channels", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            auth: "key:sig",
            channel_data: '{"user_id":"1","user_info":{"name":"Alice"}}',
          }),
      });

      const client = createClient({ authEndpoint: "/auth" });
      client.connect();
      ws().simulateConnectionEstablished();
      ws().sent = [];

      client.subscribe("presence-room");
      await vi.advanceTimersByTimeAsync(0);

      const msgs = sentMessages();
      const sub = msgs.find((m) => m.event === "realtime:subscribe");
      const data = JSON.parse(sub!.data as string);
      expect(data.channel_data).toBe('{"user_id":"1","user_info":{"name":"Alice"}}');
    });

    it("keeps presence me undefined before subscription_succeeded", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            auth: "key:sig",
            channel_data: '{"user_id":"1","user_info":{"name":"Alice"}}',
          }),
      });

      const client = createClient({ authEndpoint: "/auth" });
      client.connect();
      ws().simulateConnectionEstablished();

      const ch = client.subscribe("presence-room") as PresenceChannel;
      await vi.advanceTimersByTimeAsync(0);
      expect(ch.me).toBeUndefined();
    });

    it("sets presence me after subscription_succeeded from auth channel_data", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            auth: "key:sig",
            channel_data: '{"user_id":"1","user_info":{"name":"Alice"}}',
          }),
      });

      const client = createClient({ authEndpoint: "/auth" });
      client.connect();
      ws().simulateConnectionEstablished();
      const ch = client.subscribe("presence-room") as PresenceChannel;
      await vi.advanceTimersByTimeAsync(0);

      ws().simulateMessage({
        event: "realtime:subscription_succeeded",
        channel: "presence-room",
        data: JSON.stringify({
          presence: {
            count: 1,
            ids: ["1"],
            hash: { "1": { name: "Alice" } },
          },
        }),
      });

      expect(ch.me).toEqual({
        user_id: "1",
        user_info: { name: "Alice" },
      });
      expect(ch.memberCount).toBe(1);
    });

    it("updates presence me on reconnect using fresh auth channel_data", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              auth: "key:sig-1",
              channel_data: '{"user_id":"1","user_info":{"name":"Alice"}}',
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              auth: "key:sig-2",
              channel_data: '{"user_id":"1","user_info":{"name":"Alice v2"}}',
            }),
        });

      const client = createClient({ authEndpoint: "/auth" });
      client.connect();
      ws().simulateConnectionEstablished();
      const ch = client.subscribe("presence-room") as PresenceChannel;
      await vi.advanceTimersByTimeAsync(0);

      ws().simulateMessage({
        event: "realtime:subscription_succeeded",
        channel: "presence-room",
        data: JSON.stringify({
          presence: {
            count: 1,
            ids: ["1"],
            hash: { "1": { name: "Alice" } },
          },
        }),
      });
      expect(ch.me).toEqual({
        user_id: "1",
        user_info: { name: "Alice" },
      });

      ws().simulateMessage({
        event: "realtime:member_added",
        channel: "presence-room",
        data: JSON.stringify({ user_id: "2", user_info: { name: "Bob" } }),
      });
      expect(ch.memberCount).toBe(2);

      ws().onclose?.();
      vi.advanceTimersByTime(1000); // first reconnect delay
      ws().simulateConnectionEstablished();
      await vi.advanceTimersByTimeAsync(0);

      ws().simulateMessage({
        event: "realtime:subscription_succeeded",
        channel: "presence-room",
        data: JSON.stringify({
          presence: {
            count: 1,
            ids: ["1"],
            hash: { "1": { name: "Alice v2" } },
          },
        }),
      });

      expect(ch.memberCount).toBe(1);
      expect(ch.getMember("2")).toBeUndefined();
      expect(ch.me).toEqual({
        user_id: "1",
        user_info: { name: "Alice v2" },
      });
    });

    it("fires subscription_error and skips subscribe when presence channel_data is missing", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ auth: "key:sig" }),
      });

      const client = createClient({ authEndpoint: "/auth" });
      client.connect();
      ws().simulateConnectionEstablished();
      ws().sent = [];

      const ch = client.subscribe("presence-room") as PresenceChannel;
      const cb = vi.fn();
      ch.bind("realtime:subscription_error", cb);

      await vi.advanceTimersByTimeAsync(0);

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ error: "channel_data required for presence channels" })
      );
      const msgs = sentMessages();
      expect(msgs.find((m) => m.event === "realtime:subscribe")).toBeUndefined();
      expect(ch.me).toBeUndefined();
    });

    it("fires subscription_error and skips subscribe when presence channel_data is invalid", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            auth: "key:sig",
            channel_data: '{"user_id":1}',
          }),
      });

      const client = createClient({ authEndpoint: "/auth" });
      client.connect();
      ws().simulateConnectionEstablished();
      ws().sent = [];

      const ch = client.subscribe("presence-room") as PresenceChannel;
      const cb = vi.fn();
      ch.bind("realtime:subscription_error", cb);

      await vi.advanceTimersByTimeAsync(0);

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ error: "invalid channel_data" })
      );
      const msgs = sentMessages();
      expect(msgs.find((m) => m.event === "realtime:subscribe")).toBeUndefined();
      expect(ch.me).toBeUndefined();
    });

    it("fires subscription_error when no authEndpoint configured", async () => {
      const client = createClient(); // no authEndpoint
      const cb = vi.fn();

      // Pre-subscribe to get the channel, bind error handler before connect triggers sendSubscribe
      const ch = client.subscribe("private-ch");
      ch.bind("realtime:subscription_error", cb);

      // Now connect — triggers sendSubscribe for pending channels
      client.connect();
      ws().simulateConnectionEstablished();

      // sendSubscribe is async, flush microtasks
      await vi.advanceTimersByTimeAsync(0);

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ type: "AuthError" })
      );
    });

    it("fires subscription_error when auth fetch fails", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const client = createClient({ authEndpoint: "/auth" });
      client.connect();
      ws().simulateConnectionEstablished();

      const ch = client.subscribe("private-ch");
      const cb = vi.fn();
      ch.bind("realtime:subscription_error", cb);

      await vi.advanceTimersByTimeAsync(0);

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ type: "AuthError" })
      );
    });
  });
});
