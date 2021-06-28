import { Deferred, deferred } from "https://deno.land/std@0.99.0/async/mod.ts";
import { EventEmitter } from "https://deno.land/x/event@2.0.0/mod.ts";
import { WebSocketClient } from "./web_socket_client.ts";
import { v4 as uuid } from "https://deno.land/std@0.99.0/uuid/mod.ts";
import {
  CONNECTION_ERROR,
  CONNECTION_INIT,
  CONNECTION_KEEP_ALIVE,
  CONNECTION_READY,
  ERROR_MESSAGE,
  EventMap,
  isResponse,
  MessageRequestTypes,
  REQUEST_KEY,
  RESPONSE_KEY,
  SUBSCRIPTION_COMPLETE,
  SUBSCRIPTION_DATA,
  SUBSCRIPTION_READY,
  SUBSCRIPTION_START,
  SUBSCRIPTION_STOP,
  SubscriptionData,
  SubscriptionStartReq,
  SubscriptionStopReq,
} from "./message_types.ts";
import {
  AuthNotImplementedError,
  ConnectionFailedError,
  NoConnectionError,
  NoTimeoutSet,
  TimeoutError,
} from "./errors.ts";

const RESPONSE_TIMEOUT = 15000;
const GRAPHQL_WS_PROTOCOL = "graphql-ws";
const APPSYNC_DOMAIN_API = "appsync-api";
const APPSYNC_DOMAIN_WS = "appsync-realtime-api";

interface AuthApiKey {
  kind: "api_key";
  apiKey: string;
}

interface Options {
  endpoint: string | URL;
  auth: AuthApiKey;
  abortController?: AbortController;
}

interface SubscriptionOptions {
  id?: string;
  query: string;
  variables?: Record<string, any>;
}

interface SubmitRequestOptions {
  request: MessageRequestTypes;
  builders: ListenerBuilder[];
  timeout?: number;
}

type OnFunc<K extends keyof EventMap> = (...args: EventMap[K]) => void;
type BuildOnFunc<K extends keyof EventMap> = (
  done: Deferred<void>,
) => OnFunc<K>;
type ListenerBuilder<K extends keyof EventMap = any> = [K, BuildOnFunc<K>];
type ListenerTuple<K extends keyof EventMap = any> = [K, OnFunc<K>];
type MapListenerBuilders = { [key in keyof EventMap]: ListenerBuilder<key> };
type ResponseType = MapListenerBuilders[typeof RESPONSE_KEY];
type SubReadyTuple = MapListenerBuilders[typeof SUBSCRIPTION_READY];
type SubCompleteTuple = MapListenerBuilders[typeof SUBSCRIPTION_COMPLETE];
type ErrorMsgTuple = MapListenerBuilders[typeof ERROR_MESSAGE];

export class AppSyncWebSocket extends EventEmitter<EventMap & { end: [] }> {
  private auth: AuthApiKey;
  private endpoint: URL;
  private socket: WebSocketClient | undefined;
  private keepAliveTimeout: number | undefined;
  private keepAliveTimeoutId: number | undefined;
  private controller: AbortController;
  private subscriptions: Set<string> = new Set();
  private _done = deferred<void>();
  signal: AbortSignal;

  constructor({ endpoint, auth, abortController: abort }: Options) {
    super();
    this.auth = auth;
    this.endpoint = endpoint instanceof URL ? endpoint : new URL(endpoint);
    this.controller = abort !== undefined ? abort : new AbortController();
    this.signal = this.controller.signal;
    this.signal.addEventListener("abort", this.abort.bind(this));
  }

  get done(): Promise<void> {
    return this._done;
  }

  private async abort() {
    console.log("Abort triggered.");
    clearTimeout(this.keepAliveTimeoutId);

    if (this.socket?.isClosed === false) {
      const subs = Array.from(this.subscriptions);
      this.subscriptions.clear();
      const len = subs.length;

      console.log(`Closing ${len} subscriptions.`);
      await Promise.all(
        subs.map((id) =>
          this.unsubscribe(id)
            .then(() => console.log("Successfully closed subscription."))
            .catch((e) => console.error(`Encountered error: ${e}`))
        ),
      );

      console.log("Closing web socket.");
      await this.off();
      await this.socket?.close();
    }

    await this.emit("end");
    this._done.resolve();
  }

  async connect() {
    await this.createWebSocket();
    await this.waitForConnection();
  }

  private buildHeaders() {
    if (this.auth.kind == "api_key") {
      const dt = new Date();
      const dtStr = dt.toISOString().replace(/[:\-]|\.\d{3}/g, "");

      return {
        host: this.endpoint.host,
        "x-amz-date": dtStr,
        "x-api-key": this.auth.apiKey,
      };
    }

    throw new AuthNotImplementedError();
  }

  private buildUrl(payload: Record<string, any> = {}) {
    const host = this.endpoint
      .toString()
      .replace(
        APPSYNC_DOMAIN_API,
        APPSYNC_DOMAIN_WS,
      );

    const addr = new URL(host);
    addr.protocol = this.endpoint.protocol === "https:" ? "wss:" : "ws:";
    addr.searchParams.set("payload", btoa(JSON.stringify(payload)));
    addr.searchParams.set("header", btoa(JSON.stringify(this.buildHeaders())));

    return addr;
  }

  private async send(req: MessageRequestTypes) {
    if (this.socket === undefined) {
      throw new NoConnectionError();
    }

    await this.emit(req.type, req as any);
    await this.emit(REQUEST_KEY, req);
    await this.socket.send(JSON.stringify(req));
  }

  private async onMessage(msg: MessageEvent) {
    if (typeof msg.data !== "string") {
      return;
    }

    const evt = JSON.parse(msg.data);

    if (isResponse(evt)) {
      if (evt.type === CONNECTION_KEEP_ALIVE) {
        this.resetConnectionTimeout();
      }

      await this.emit(evt.type, evt as any);
      await this.emit(RESPONSE_KEY, evt);
    }
  }

  private resetConnectionTimeout() {
    if (this.keepAliveTimeout === undefined) {
      this.abort();
      throw new NoTimeoutSet();
    }

    clearTimeout(this.keepAliveTimeoutId);
    this.keepAliveTimeoutId = setTimeout(
      () => this.controller.abort(),
      this.keepAliveTimeout,
    );
  }

  private async createWebSocket(): Promise<void> {
    const done = deferred<void>();
    const onOpen = () => done.resolve();
    const onClose = () => done.reject(new ConnectionFailedError());

    try {
      const url = this.buildUrl();
      this.socket = new WebSocketClient(url.toString(), GRAPHQL_WS_PROTOCOL);
      this.socket.on("message", this.onMessage.bind(this));
      this.socket.on("open", onOpen);
      this.socket.on("close", onClose);
      await done;
      this.socket.on("close", () => this.controller.abort());
    } catch (err) {
      this.controller.abort();
      throw err;
    } finally {
      await this.socket?.off("open", onOpen);
      await this.socket?.off("close", onClose);
    }
  }

  private async submitRequest(
    { request, builders, timeout }: SubmitRequestOptions,
  ): Promise<void> {
    let timeoutId: number | undefined;
    const done = deferred<void>();
    const errors: string[] = [];
    const { id } = { id: undefined, ...request };

    const onError: ErrorMsgTuple = [
      ERROR_MESSAGE,
      (_done) =>
        (evt) => {
          const { payload: { errors: [{ message }] } } = evt;
          if (id !== undefined && evt.id !== undefined && evt.id === id) {
            _done.reject(message);
          }

          if (evt.id === undefined) {
            errors.push(message);
          }
        },
    ];

    const listeners = [...builders, onError]
      .map(([k, fn]) => [k, fn(done)] as ListenerTuple);

    try {
      listeners.forEach((l) => this.on(...l));

      if (timeout !== undefined) {
        timeoutId = setTimeout(() => {
          throw new TimeoutError(errors);
        }, timeout);
      }

      await this.send(request);
      await done;
    } catch (err) {
      if (err instanceof NoConnectionError) {
        this.controller.abort();
      }

      throw err;
    } finally {
      clearTimeout(timeoutId);
      await Promise.all(listeners.map((l) => this.off(...l)));
    }
  }

  private async waitForConnection(): Promise<void> {
    const onResponse: ResponseType = [
      RESPONSE_KEY,
      (done) =>
        (evt) => {
          if (evt.type === CONNECTION_READY) {
            this.keepAliveTimeout = evt.payload.connectionTimeoutMs;
            this.resetConnectionTimeout();
            done.resolve();
          }

          if (evt.type === CONNECTION_ERROR) {
            const { payload: { errors: [{ message }] } } = evt;
            // use internal error
            done.reject(new Error(message));
          }
        },
    ];

    await this.submitRequest({
      request: { type: CONNECTION_INIT },
      builders: [onResponse],
      timeout: RESPONSE_TIMEOUT,
    });
  }

  private async *filterSubscriptionById(id: string) {
    this.subscriptions.add(id);

    for await (const [evt] of this.on(SUBSCRIPTION_DATA)) {
      if (evt.id === id) {
        yield evt;
      }
    }

    // This logic handles cancellation of iterator by the consumer, and is
    // skipped when client receives an abort signal.
    if (this.subscriptions.delete(id)) {
      await this.unsubscribe(id);
    }
  }

  private async waitForSubscription(
    request: SubscriptionStartReq,
  ): Promise<AsyncIterableIterator<SubscriptionData>> {
    const onReady: SubReadyTuple = [
      SUBSCRIPTION_READY,
      (done) =>
        ({ id }) => {
          if (id === request.id) done.resolve();
        },
    ];

    await this.submitRequest({
      request,
      builders: [onReady],
      timeout: RESPONSE_TIMEOUT,
    });

    return this.filterSubscriptionById(request.id);
  }

  private async unsubscribe(id: string) {
    const request: SubscriptionStopReq = { type: SUBSCRIPTION_STOP, id };

    const onComplete: SubCompleteTuple = [
      SUBSCRIPTION_COMPLETE,
      (done) =>
        (evt) => {
          if (evt.id === id) done.resolve();
        },
    ];

    await this.submitRequest({
      request,
      builders: [onComplete],
      timeout: RESPONSE_TIMEOUT,
    });
  }

  subscribe(
    { id, query, variables }: SubscriptionOptions,
  ): Promise<AsyncIterableIterator<SubscriptionData>> {
    return this.waitForSubscription({
      type: SUBSCRIPTION_START,
      id: id ?? uuid.generate(),
      payload: {
        data: JSON.stringify({ query, variable: variables ?? {} }),
        extensions: { authorization: this.buildHeaders() },
      },
    });
  }
}
