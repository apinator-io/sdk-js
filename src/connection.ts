import type { Message, RealtimeOptions } from "./types";
import { SDK_VERSION } from "./version";

export type ConnectionState =
  | "initialized"
  | "connecting"
  | "connected"
  | "unavailable"
  | "disconnected";

type MessageHandler = (msg: Message) => void;
type StateChangeHandler = (
  previous: ConnectionState,
  current: ConnectionState
) => void;

const DEFAULT_ACTIVITY_TIMEOUT_S = 120;
const DEFAULT_PONG_TIMEOUT_S = 30;
const MAX_RECONNECT_DELAY_MS = 30000;

/**
 * Codes 4000-4099 mean the server refused the connection for a reason retrying
 * cannot fix (invalid app key, app disabled, wrong cluster), so the client stops.
 */
export function isFatalCode(code: unknown): boolean {
  return typeof code === "number" && code >= 4000 && code < 4100;
}

/** Returns `value` if it is a positive finite number, otherwise `undefined`. */
function positive(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

export class Connection {
  private ws: WebSocket | null = null;
  private state: ConnectionState = "initialized";
  private options: RealtimeOptions;
  private onMessage: MessageHandler;
  private onStateChange: StateChangeHandler;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activityTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private activityTimeoutMs = DEFAULT_ACTIVITY_TIMEOUT_S * 1000;
  private socketId: string | null = null;

  constructor(
    options: RealtimeOptions,
    onMessage: MessageHandler,
    onStateChange: StateChangeHandler
  ) {
    this.options = options;
    this.onMessage = onMessage;
    this.onStateChange = onStateChange;
  }

  get id(): string | null {
    return this.socketId;
  }

  get currentState(): ConnectionState {
    return this.state;
  }

  private resolveWSHost(): string {
    return `wss://ws-${this.options.cluster}.apinator.io`;
  }

  connect(): void {
    // A socket is already open or opening.
    if (this.ws) return;

    // An explicit connect() while a reconnect is pending connects right away.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.setState("connecting");

    const url = `${this.resolveWSHost()}/app/${this.options.appKey}?protocol=7&client=js&version=${encodeURIComponent(SDK_VERSION)}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.handleDisconnect();
      return;
    }
    this.ws = ws;

    // Handlers ignore events from a socket that has since been replaced, so a
    // late close from an old socket can't tear down the current one.
    ws.onmessage = (event: MessageEvent) => {
      if (this.ws !== ws) return;
      let msg: Message;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        // Ignore malformed messages
        return;
      }
      // Any traffic from the server proves the connection is alive.
      this.resetActivityTimer();
      this.handleMessage(msg);
    };

    ws.onclose = (event?: CloseEvent) => {
      if (this.ws !== ws) return;
      if (event && isFatalCode(event.code)) {
        // Refused for good (the realtime:error explaining why may have arrived
        // first); reconnecting would fail the same way forever.
        this.ws = null;
        this.disconnect();
        return;
      }
      this.handleDisconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  disconnect(): void {
    this.clearTimers();
    this.setState("disconnected");
    if (this.ws) {
      this.ws.close(1000, "client disconnect");
      this.ws = null;
    }
  }

  send(msg: Message): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(msg: Message): void {
    if (msg.event === "realtime:connection_established") {
      const data = JSON.parse(msg.data);
      this.socketId = data.socket_id;
      this.reconnectAttempts = 0;
      const timeoutS =
        positive(this.options.activityTimeout) ??
        positive(data.activity_timeout) ??
        DEFAULT_ACTIVITY_TIMEOUT_S;
      this.activityTimeoutMs = timeoutS * 1000;
      this.setState("connected");
      this.resetActivityTimer();
    } else if (msg.event === "realtime:error") {
      const data = JSON.parse(msg.data);
      if (isFatalCode(data.code)) {
        // The server says why (e.g. an app ID used as the key, or the wrong
        // cluster). Surface it, let bind("realtime:error") see it, then stop.
        console.error(`[apinator] ${data.message ?? "connection refused"} (code ${data.code})`);
        this.onMessage(msg);
        this.disconnect();
        return;
      }
    }

    this.onMessage(msg);
  }

  private handleDisconnect(): void {
    this.ws = null;
    this.clearTimers();

    if (this.state === "disconnected") return;

    const maxAttempts = this.options.maxReconnectAttempts ?? Infinity;
    if (this.options.enableReconnect === false || this.reconnectAttempts >= maxAttempts) {
      this.setState("unavailable");
      return;
    }

    this.setState("connecting");
    const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempts), MAX_RECONNECT_DELAY_MS);
    // Jitter (50–100% of the backoff) so clients dropped together by a server
    // restart don't all reconnect in the same instant.
    const delay = backoff * (0.5 + Math.random() * 0.5);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  /**
   * (Re)starts the idle timer. When it fires the client pings and waits up to
   * pongTimeout for any server message; if none arrives the socket is closed
   * and the normal reconnect path takes over.
   */
  private resetActivityTimer(): void {
    if (this.state !== "connected" && this.state !== "connecting") return;
    if (this.activityTimer) clearTimeout(this.activityTimer);
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
    this.activityTimer = setTimeout(() => {
      this.activityTimer = null;
      this.send({ event: "realtime:ping", data: "{}" });
      const pongTimeoutS = positive(this.options.pongTimeout) ?? DEFAULT_PONG_TIMEOUT_S;
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        // A dead network can delay onclose for a long time, so drop the socket
        // and start reconnecting now instead of waiting for it.
        const ws = this.ws;
        if (!ws) return;
        this.handleDisconnect();
        ws.close();
      }, pongTimeoutS * 1000);
    }, this.activityTimeoutMs);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
      this.activityTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private setState(state: ConnectionState): void {
    const prev = this.state;
    this.state = state;
    // A socket ID only identifies the connection that announced it.
    if (state !== "connected") this.socketId = null;
    if (prev !== state) {
      this.onStateChange(prev, state);
    }
  }
}
