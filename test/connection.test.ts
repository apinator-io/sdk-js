import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Connection } from "../src/connection";
import type { Message } from "../src/types";

// Mock WebSocket
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
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(_code?: number, _reason?: string) {
    this.closed = true;
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  simulateOpen() {
    this.onopen?.();
  }

  simulateMessage(msg: Message) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  simulateClose() {
    this.onclose?.();
  }

  simulateConnectionEstablished(
    socketId = "123.456",
    activityTimeout = 120
  ) {
    this.simulateOpen();
    this.simulateMessage({
      event: "realtime:connection_established",
      data: JSON.stringify({
        socket_id: socketId,
        activity_timeout: activityTimeout,
      }),
    });
  }
}

describe("Connection", () => {
  let onMessage: ReturnType<typeof vi.fn>;
  let onStateChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.useFakeTimers();
    onMessage = vi.fn();
    onStateChange = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function createConnection(overrides = {}) {
    return new Connection(
      { appKey: "test-key", cluster: "eu", ...overrides },
      onMessage,
      onStateChange
    );
  }

  it("starts in initialized state", () => {
    const conn = createConnection();
    expect(conn.currentState).toBe("initialized");
    expect(conn.id).toBeNull();
  });

  it("connects to the correct URL using cluster", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe(
      "wss://ws-eu.apinator.io/app/test-key?protocol=7&client=js&version=1.0.0"
    );
  });

  it("uses the correct cluster in URL", () => {
    const conn = createConnection({ cluster: "us" });
    conn.connect();
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe(
      "wss://ws-us.apinator.io/app/test-key?protocol=7&client=js&version=1.0.0"
    );
  });

  it("transitions to connecting then connected", () => {
    const conn = createConnection();
    conn.connect();
    expect(conn.currentState).toBe("connecting");
    expect(onStateChange).toHaveBeenCalledWith("initialized", "connecting");

    MockWebSocket.instances[0].simulateConnectionEstablished();
    expect(conn.currentState).toBe("connected");
    expect(conn.id).toBe("123.456");
    expect(onStateChange).toHaveBeenCalledWith("connecting", "connected");
  });

  it("ignores connect() if already connected", () => {
    const conn = createConnection();
    conn.connect();
    MockWebSocket.instances[0].simulateConnectionEstablished();
    conn.connect(); // should be no-op
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("ignores connect() if already connecting", () => {
    const conn = createConnection();
    conn.connect();
    conn.connect(); // should be no-op
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("forwards messages to onMessage handler", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished();

    ws.simulateMessage({
      event: "my-event",
      channel: "my-channel",
      data: '{"text":"hello"}',
    });

    // onMessage gets called for connection_established + my-event
    expect(onMessage).toHaveBeenCalledWith({
      event: "my-event",
      channel: "my-channel",
      data: '{"text":"hello"}',
    });
  });

  it("send only works when WebSocket is OPEN", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];

    // Before connection established, WS is OPEN (mock default)
    conn.send({ event: "test", data: "{}" });
    expect(ws.sent).toHaveLength(1);

    // After close
    ws.readyState = MockWebSocket.CLOSED;
    conn.send({ event: "test2", data: "{}" });
    expect(ws.sent).toHaveLength(1); // still 1
  });

  it("disconnect closes WebSocket and sets state", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished();

    conn.disconnect();
    expect(conn.currentState).toBe("disconnected");
    expect(ws.closed).toBe(true);
    expect(onStateChange).toHaveBeenCalledWith("connected", "disconnected");
  });

  it("schedules reconnect on unexpected close", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished();

    // Simulate unexpected close
    ws.simulateClose();
    expect(conn.currentState).toBe("connecting");
  });

  it("does not reconnect after explicit disconnect", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished();

    conn.disconnect();
    ws.simulateClose(); // should be ignored
    vi.advanceTimersByTime(60000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("goes unavailable after maxReconnectAttempts", () => {
    const conn = createConnection({ maxReconnectAttempts: 6 });
    conn.connect();

    // Exhaust all 6 reconnect attempts
    for (let i = 0; i < 6; i++) {
      MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose();
      vi.advanceTimersByTime(30000); // max backoff
    }

    // 7th close should go unavailable
    MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose();
    expect(conn.currentState).toBe("unavailable");
  });

  it("resets reconnect counter on successful open", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];

    // onopen resets reconnectAttempts to 0 internally
    ws.simulateConnectionEstablished();
    expect(conn.currentState).toBe("connected");

    // Close and verify it tries to reconnect (state goes to connecting, not unavailable)
    ws.simulateClose();
    expect(conn.currentState).toBe("connecting");
  });

  it("handles fatal error codes by disconnecting", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished();

    ws.simulateMessage({
      event: "realtime:error",
      data: JSON.stringify({ code: 4001, message: "App not found" }),
    });

    expect(conn.currentState).toBe("disconnected");
  });

  it("falls back to 120s activity timeout when server sends 0", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({
      event: "realtime:connection_established",
      data: JSON.stringify({ socket_id: "123.456", activity_timeout: 0 }),
    });

    // Should not ping before 120s
    vi.advanceTimersByTime(119000);
    const sentBefore = ws.sent.map((s) => JSON.parse(s));
    expect(sentBefore).not.toContainEqual({ event: "realtime:ping", data: "{}" });

    // Should ping at 120s
    vi.advanceTimersByTime(1000);
    const sentAfter = ws.sent.map((s) => JSON.parse(s));
    expect(sentAfter).toContainEqual({ event: "realtime:ping", data: "{}" });
  });

  it("sends ping on activity timeout", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished("123.456", 5); // 5 second timeout

    vi.advanceTimersByTime(5000);
    const sent = ws.sent.map((s) => JSON.parse(s));
    expect(sent).toContainEqual({ event: "realtime:ping", data: "{}" });
  });

  it("closes connection if no pong after 30s", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished("123.456", 5);

    // Trigger ping
    vi.advanceTimersByTime(5000);
    // No pong — wait 30s
    vi.advanceTimersByTime(30000);
    expect(ws.closed).toBe(true);
  });

  it("keeps the connection open when the pong arrives", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished("123.456", 5);

    // Several idle cycles, each answered by a pong.
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(5000);
      ws.simulateMessage({ event: "realtime:pong", data: "{}" });
      vi.advanceTimersByTime(29000);
    }

    expect(ws.closed).toBe(false);
    expect(conn.currentState).toBe("connected");
  });

  it("does not ping while the server keeps sending messages", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished("123.456", 5);

    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(4000);
      ws.simulateMessage({ event: "my-event", channel: "c", data: "{}" });
    }

    const sent = ws.sent.map((s) => JSON.parse(s));
    expect(sent).not.toContainEqual({ event: "realtime:ping", data: "{}" });
    expect(ws.closed).toBe(false);
  });

  it("uses the activityTimeout option over the server value", () => {
    const conn = createConnection({ activityTimeout: 20 });
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished("123.456", 120);

    vi.advanceTimersByTime(19000);
    expect(ws.sent).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(ws.sent.map((s) => JSON.parse(s))).toContainEqual({
      event: "realtime:ping",
      data: "{}",
    });
  });

  it("allows an activityTimeout longer than the server value", () => {
    const conn = createConnection({ activityTimeout: 300 });
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished("123.456", 120);

    vi.advanceTimersByTime(299000);
    expect(ws.sent).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(ws.sent).toHaveLength(1);
  });

  it("ignores an invalid activityTimeout option", () => {
    const conn = createConnection({ activityTimeout: 0 });
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished("123.456", 5);

    vi.advanceTimersByTime(5000);
    expect(ws.sent).toHaveLength(1);
  });

  it("uses the pongTimeout option", () => {
    const conn = createConnection({ pongTimeout: 5 });
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished("123.456", 5);

    vi.advanceTimersByTime(5000); // ping
    vi.advanceTimersByTime(4999);
    expect(ws.closed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(ws.closed).toBe(true);
  });

  it("does not reconnect when enableReconnect is false", () => {
    const conn = createConnection({ enableReconnect: false });
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished();

    ws.simulateClose();
    expect(conn.currentState).toBe("unavailable");
    vi.advanceTimersByTime(60000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("keeps reconnecting by default", () => {
    const conn = createConnection();
    conn.connect();

    for (let i = 0; i < 20; i++) {
      MockWebSocket.instances[MockWebSocket.instances.length - 1].simulateClose();
      expect(conn.currentState).toBe("connecting");
      vi.advanceTimersByTime(30000);
    }
    expect(MockWebSocket.instances).toHaveLength(21);
  });

  it("jitters the reconnect delay between 50% and 100% of the backoff", () => {
    const conn = createConnection();
    conn.connect();
    MockWebSocket.instances[0].simulateConnectionEstablished();

    vi.spyOn(Math, "random").mockReturnValue(0);
    MockWebSocket.instances[0].simulateClose(); // backoff 1000ms -> 500ms
    vi.advanceTimersByTime(499);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    MockWebSocket.instances[1].simulateClose(); // backoff 2000ms -> ~2000ms
    vi.advanceTimersByTime(1998);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(2);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("keeps backing off when the server closes right after open", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const conn = createConnection();
    conn.connect();

    // Socket opens but is closed before connection_established (e.g. rejected).
    const cycle = () => {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateOpen();
      ws.simulateClose();
    };
    cycle(); // attempt 0 -> ~1s
    vi.advanceTimersByTime(1000);
    cycle(); // attempt 1 -> ~2s
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("stops timers after disconnect", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateConnectionEstablished("123.456", 5);
    vi.advanceTimersByTime(5000); // ping sent, pong timer armed

    conn.disconnect();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reconnects after a missed pong", () => {
    const conn = createConnection();
    conn.connect();
    MockWebSocket.instances[0].simulateConnectionEstablished("123.456", 5);

    vi.advanceTimersByTime(5000 + 30000);
    expect(MockWebSocket.instances[0].closed).toBe(true);
    expect(conn.currentState).toBe("connecting");

    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("ignores a late close from a replaced socket", () => {
    const conn = createConnection();
    conn.connect();
    const oldWs = MockWebSocket.instances[0];
    oldWs.simulateConnectionEstablished();

    conn.disconnect();
    conn.connect();
    const newWs = MockWebSocket.instances[1];
    newWs.simulateConnectionEstablished("789.000");

    oldWs.simulateClose();
    expect(conn.currentState).toBe("connected");
    expect(conn.id).toBe("789.000");
    conn.send({ event: "test", data: "{}" });
    expect(newWs.sent).toHaveLength(1);
  });

  it("connect() during a pending reconnect connects immediately", () => {
    const conn = createConnection();
    conn.connect();
    MockWebSocket.instances[0].simulateConnectionEstablished();
    MockWebSocket.instances[0].simulateClose();

    conn.connect();
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(60000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("ignores malformed WebSocket messages", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Send garbage
    ws.onmessage?.({ data: "not json" });
    // Should not throw or call onMessage
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("does not swallow handleMessage errors inside onmessage", () => {
    const conn = createConnection();
    conn.connect();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    expect(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          event: "realtime:connection_established",
          data: "not-json",
        }),
      });
    }).toThrow();
  });
});
