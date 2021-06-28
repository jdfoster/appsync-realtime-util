import { EventEmitter } from "https://deno.land/x/event@2.0.0/mod.ts";

enum WebSocketState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

type WebSocketEvents = {
  open: [Event];
  close: [CloseEvent];
  error: [Event | ErrorEvent];
  message: [MessageEvent];
};

export class WebSocketClient extends EventEmitter<WebSocketEvents> {
  webSocket: WebSocket;

  constructor(endpoint: string, protocol?: string | string[]) {
    super();

    this.webSocket = new WebSocket(endpoint, protocol);
    this.webSocket.onopen = (evt) => this.emit("open", evt);
    this.webSocket.onmessage = (msg) => this.emit("message", msg);
    this.webSocket.onclose = (evt) => this.emit("close", evt);
    this.webSocket.onerror = (evt) => this.emit("error", evt);
  }

  async ping() {
    if (this.webSocket.readyState === WebSocketState.CONNECTING) {
      throw new Error(
        "WebSocket is not open: state 0 (CONNECTING)",
      );
    }
    return this.webSocket.send("ping");
  }

  async send(message: string | Uint8Array) {
    if (this.webSocket.readyState === WebSocketState.CONNECTING) {
      throw new Error(
        "WebSocket is not open: state 0 (CONNECTING)",
      );
    }
    return this.webSocket.send(message);
  }

  async close(code = 1000, reason?: string): Promise<void> {
    if (
      this.webSocket.readyState === WebSocketState.CLOSING ||
      this.webSocket.readyState === WebSocketState.CLOSED
    ) {
      return;
    }
    return this.webSocket!.close(code, reason!);
  }

  get isClosed(): boolean | undefined {
    return this.webSocket.readyState === WebSocketState.CLOSING ||
      this.webSocket.readyState === WebSocketState.CLOSED;
  }
}
