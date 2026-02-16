import type { Message, RealtimeOptions } from "./types";

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

export class Connection {
  private ws: WebSocket | null = null;
  private state: ConnectionState = "initialized";
  private options: RealtimeOptions;
  private onMessage: MessageHandler;
  private onStateChange: StateChangeHandler;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activityTimer: ReturnType<typeof setTimeout> | null = null;
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
    if (this.state === "connected" || this.state === "connecting") return;

    this.setState("connecting");

    const url = `${this.resolveWSHost()}/app/${this.options.appKey}?protocol=7&client=js&version=1.0.0`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.handleDisconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      let msg: Message;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        // Ignore malformed messages
        return;
      }
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      this.handleDisconnect();
    };

    this.ws.onerror = () => {
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
      const timeout = data.activity_timeout || 120;
      this.setState("connected");
      this.resetActivityTimer(timeout);
    } else if (msg.event === "realtime:pong") {
      // Activity timeout reset handled by receiving any message
    } else if (msg.event === "realtime:error") {
      const data = JSON.parse(msg.data);
      if (data.code >= 4000 && data.code <= 4004) {
        // Fatal error, don't reconnect
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

    if (this.reconnectAttempts < 6) {
      this.setState("connecting");
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      this.reconnectAttempts++;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    } else {
      this.setState("unavailable");
    }
  }

  private resetActivityTimer(timeoutSeconds: number): void {
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.activityTimer = setTimeout(() => {
      this.send({ event: "realtime:ping", data: "{}" });
      // If no pong within 30s, reconnect
      this.activityTimer = setTimeout(() => {
        if (this.ws) this.ws.close();
      }, 30000);
    }, timeoutSeconds * 1000);
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
  }

  private setState(state: ConnectionState): void {
    const prev = this.state;
    this.state = state;
    if (prev !== state) {
      this.onStateChange(prev, state);
    }
  }
}
