import { describe, it, expect, vi } from "vitest";
import { Channel, PresenceChannel } from "../src/channel";

describe("Channel", () => {
  it("stores the channel name", () => {
    const ch = new Channel("my-channel");
    expect(ch.name).toBe("my-channel");
  });

  it("starts as not subscribed", () => {
    const ch = new Channel("ch");
    expect(ch.subscribed).toBe(false);
  });

  it("bind and emit events", () => {
    const ch = new Channel("ch");
    const cb = vi.fn();
    ch.bind("msg", cb);
    ch.handleEvent("msg", { text: "hello" });
    expect(cb).toHaveBeenCalledWith({ text: "hello" });
  });

  it("supports multiple callbacks for the same event", () => {
    const ch = new Channel("ch");
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    ch.bind("msg", cb1);
    ch.bind("msg", cb2);
    ch.handleEvent("msg", "data");
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });

  it("does not fire callbacks for other events", () => {
    const ch = new Channel("ch");
    const cb = vi.fn();
    ch.bind("msg", cb);
    ch.handleEvent("other", "data");
    expect(cb).not.toHaveBeenCalled();
  });

  it("unbind removes a specific callback", () => {
    const ch = new Channel("ch");
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    ch.bind("msg", cb1);
    ch.bind("msg", cb2);
    ch.unbind("msg", cb1);
    ch.handleEvent("msg", "data");
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledOnce();
  });

  it("unbind without callback removes all callbacks for event", () => {
    const ch = new Channel("ch");
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    ch.bind("msg", cb1);
    ch.bind("msg", cb2);
    ch.unbind("msg");
    ch.handleEvent("msg", "data");
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it("unbindAll clears all bindings", () => {
    const ch = new Channel("ch");
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    ch.bind("a", cb1);
    ch.bind("b", cb2);
    ch.unbindAll();
    ch.handleEvent("a", "data");
    ch.handleEvent("b", "data");
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it("bind returns this for chaining", () => {
    const ch = new Channel("ch");
    expect(ch.bind("e", () => {})).toBe(ch);
  });

  it("unbind returns this for chaining", () => {
    const ch = new Channel("ch");
    expect(ch.unbind("e")).toBe(ch);
  });

  it("unbindAll returns this for chaining", () => {
    const ch = new Channel("ch");
    expect(ch.unbindAll()).toBe(ch);
  });

  it("handleSubscribed marks as subscribed and fires event", () => {
    const ch = new Channel("ch");
    const cb = vi.fn();
    ch.bind("realtime:subscription_succeeded", cb);
    ch.handleSubscribed({ info: true });
    expect(ch.subscribed).toBe(true);
    expect(cb).toHaveBeenCalledWith({ info: true });
  });

  it("handleError marks as unsubscribed and fires event", () => {
    const ch = new Channel("ch");
    ch.handleSubscribed();
    expect(ch.subscribed).toBe(true);

    const cb = vi.fn();
    ch.bind("realtime:subscription_error", cb);
    ch.handleError({ type: "AuthError", error: "denied" });
    expect(ch.subscribed).toBe(false);
    expect(cb).toHaveBeenCalledWith({ type: "AuthError", error: "denied" });
  });

  it("trigger requires client- prefix", () => {
    const ch = new Channel("private-ch");
    expect(() => ch.trigger("no-prefix", {})).toThrow("client-");
  });

  it("trigger rejects public channels", () => {
    const ch = new Channel("my-channel");
    expect(() => ch.trigger("client-typing", {})).toThrow(
      "private or presence"
    );
  });

  it("trigger emits __internal_trigger on private channels", () => {
    const ch = new Channel("private-ch");
    const cb = vi.fn();
    ch.bind("__internal_trigger", cb);
    ch.trigger("client-typing", { user: "alice" });
    expect(cb).toHaveBeenCalledWith({
      event: "client-typing",
      data: { user: "alice" },
    });
  });

  it("trigger emits __internal_trigger on presence channels", () => {
    const ch = new Channel("presence-room");
    const cb = vi.fn();
    ch.bind("__internal_trigger", cb);
    ch.trigger("client-typing", { user: "alice" });
    expect(cb).toHaveBeenCalledWith({
      event: "client-typing",
      data: { user: "alice" },
    });
  });

  it("user callback errors do not break the SDK", () => {
    const ch = new Channel("ch");
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    ch.bind("msg", bad);
    ch.bind("msg", good);
    ch.handleEvent("msg", "data");
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
  });
});

describe("PresenceChannel", () => {
  it("is a Channel subclass", () => {
    const ch = new PresenceChannel("presence-room");
    expect(ch).toBeInstanceOf(Channel);
    expect(ch.name).toBe("presence-room");
  });

  it("starts with zero members", () => {
    const ch = new PresenceChannel("presence-room");
    expect(ch.memberCount).toBe(0);
    expect(ch.getMembers()).toEqual([]);
    expect(ch.me).toBeUndefined();
  });

  it("handleSubscribed populates members from presence snapshot and me from auth self", () => {
    const ch = new PresenceChannel("presence-room");
    const cb = vi.fn();
    ch.bind("realtime:subscription_succeeded", cb);

    ch.handleSubscribed({
      presence: {
        count: 2,
        ids: ["1", "2"],
        hash: {
          "1": { name: "Alice" },
          "2": { name: "Bob" },
        },
      },
    }, { user_id: "1", user_info: { name: "Alice" } });

    expect(ch.subscribed).toBe(true);
    expect(ch.memberCount).toBe(2);
    expect(ch.me).toEqual({ user_id: "1", user_info: { name: "Alice" } });
    expect(ch.getMember("2")).toEqual({
      user_id: "2",
      user_info: { name: "Bob" },
    });
    expect(cb).toHaveBeenCalledOnce();
  });

  it("handleSubscribed works with no data", () => {
    const ch = new PresenceChannel("presence-room");
    ch.handleSubscribed();
    expect(ch.subscribed).toBe(true);
    expect(ch.memberCount).toBe(0);
    expect(ch.me).toBeUndefined();
  });

  it("handleSubscribed keeps me undefined when self is not provided", () => {
    const ch = new PresenceChannel("presence-room");
    ch.handleSubscribed({
      presence: {
        count: 1,
        ids: ["1"],
        hash: { "1": { name: "Alice" } },
      },
    });
    expect(ch.me).toBeUndefined();
  });

  it("handleMemberAdded adds a member and fires event", () => {
    const ch = new PresenceChannel("presence-room");
    const cb = vi.fn();
    ch.bind("realtime:member_added", cb);

    const member = { user_id: "3", user_info: { name: "Carol" } };
    ch.handleMemberAdded(member);

    expect(ch.memberCount).toBe(1);
    expect(ch.getMember("3")).toEqual(member);
    expect(cb).toHaveBeenCalledWith(member);
  });

  it("handleMemberRemoved removes a member and fires event", () => {
    const ch = new PresenceChannel("presence-room");
    ch.handleSubscribed({
      presence: {
        count: 1,
        ids: ["1"],
        hash: { "1": { name: "Alice" } },
      },
    }, { user_id: "1", user_info: { name: "Alice" } });

    const cb = vi.fn();
    ch.bind("realtime:member_removed", cb);

    ch.handleMemberRemoved({ user_id: "1" });

    expect(ch.memberCount).toBe(0);
    expect(ch.getMember("1")).toBeUndefined();
    expect(cb).toHaveBeenCalledWith({ user_id: "1" });
  });

  it("clearPresenceState clears members and me", () => {
    const ch = new PresenceChannel("presence-room");
    ch.handleSubscribed({
      presence: {
        count: 1,
        ids: ["1"],
        hash: { "1": { name: "Alice" } },
      },
    });
    ch.clearPresenceState();
    expect(ch.memberCount).toBe(0);
    expect(ch.getMembers()).toEqual([]);
    expect(ch.me).toBeUndefined();
  });

  it("getMember returns undefined for unknown user", () => {
    const ch = new PresenceChannel("presence-room");
    expect(ch.getMember("unknown")).toBeUndefined();
  });

  it("getMembers skips ids that are missing from presence hash", () => {
    const ch = new PresenceChannel("presence-room");
    ch.handleSubscribed({
      presence: {
        count: 2,
        ids: ["1", "2"],
        hash: {
          "1": { name: "Alice" },
        },
      },
    });
    expect(ch.getMembers()).toEqual([{ user_id: "1", user_info: { name: "Alice" } }]);
    expect(ch.getMember("2")).toBeUndefined();
  });

  it("handleSubscribed clears stale members on resubscribe", () => {
    const ch = new PresenceChannel("presence-room");

    // First subscribe with Alice and Bob
    ch.handleSubscribed({
      presence: {
        count: 2,
        ids: ["1", "2"],
        hash: {
          "1": { name: "Alice" },
          "2": { name: "Bob" },
        },
      },
    }, { user_id: "1", user_info: { name: "Alice" } });
    expect(ch.memberCount).toBe(2);

    // Resubscribe with only Carol — Alice and Bob should be gone
    ch.handleSubscribed({
      presence: {
        count: 1,
        ids: ["3"],
        hash: { "3": { name: "Carol" } },
      },
    }, { user_id: "3", user_info: { name: "Carol" } });
    expect(ch.memberCount).toBe(1);
    expect(ch.getMember("1")).toBeUndefined();
    expect(ch.getMember("2")).toBeUndefined();
    expect(ch.getMember("3")).toBeDefined();
    expect(ch.me?.user_id).toBe("3");
  });

  it("handleSubscribed ignores malformed presence data", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ch = new PresenceChannel("presence-room");
    ch.handleSubscribed({
      presence: {
        count: 1,
        ids: ["1"],
        hash: "not-an-object",
      },
    });
    expect(ch.memberCount).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});
