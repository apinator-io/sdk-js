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

  it("goes unavailable after max reconnect attempts", () => {
    const conn = createConnection();
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
