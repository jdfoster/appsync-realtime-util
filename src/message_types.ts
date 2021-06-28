// AWS AppSync Message Types
export const CONNECTION_INIT = "connection_init";
export const CONNECTION_READY = "connection_ack";
export const CONNECTION_ERROR = "connection_error";
export const CONNECTION_KEEP_ALIVE = "ka";
export const SUBSCRIPTION_START = "start";
export const SUBSCRIPTION_READY = "start_ack";
export const SUBSCRIPTION_DATA = "data";
export const SUBSCRIPTION_STOP = "stop";
export const SUBSCRIPTION_COMPLETE = "complete";
export const ERROR_MESSAGE = "error";

// Additional Message Types
export const RESPONSE_KEY = "response";
export const REQUEST_KEY = "request";

// Message Structures
export interface ConnectionReq {
  type: typeof CONNECTION_INIT;
}

export interface ConnectionReady {
  type: typeof CONNECTION_READY;
  payload: {
    connectionTimeoutMs: number;
  };
}

export interface ConnectionError {
  type: typeof CONNECTION_ERROR;
  payload: {
    errors: {
      message: string;
      code: number;
    }[];
  };
}

export interface ConnectionKeepAlive {
  type: typeof CONNECTION_KEEP_ALIVE;
}

export interface SubscriptionStartReq {
  type: typeof SUBSCRIPTION_START;
  id: string;
  payload: {
    data: string;
    extensions: {
      authorization: Record<string, any>;
    };
  };
}

export interface SubscriptionReady {
  type: typeof SUBSCRIPTION_READY;
  id: string;
}

export interface SubscriptionData {
  type: typeof SUBSCRIPTION_DATA;
  id: string;
  payload: {
    data: unknown;
  };
}

export interface SubscriptionStopReq {
  type: typeof SUBSCRIPTION_STOP;
  id: string;
}

export interface SubscriptionComplete {
  type: typeof SUBSCRIPTION_COMPLETE;
  id: string;
}

export interface ErrorMessage {
  type: typeof ERROR_MESSAGE;
  id?: string;
  payload: {
    errors: {
      errorType: string;
      message: string;
    }[];
  };
}

// Request Collection
type MessageRequests = {
  [CONNECTION_INIT]: ConnectionReq;
  [SUBSCRIPTION_START]: SubscriptionStartReq;
  [SUBSCRIPTION_STOP]: SubscriptionStopReq;
};
type RequestKeys = keyof MessageRequests;
export type MessageRequestTypes = MessageRequests[RequestKeys];

// Response Collection
type MessageResponses = {
  [CONNECTION_READY]: ConnectionReady;
  [CONNECTION_ERROR]: ConnectionError;
  [CONNECTION_KEEP_ALIVE]: ConnectionKeepAlive;
  [SUBSCRIPTION_READY]: SubscriptionReady;
  [SUBSCRIPTION_DATA]: SubscriptionData;
  [SUBSCRIPTION_COMPLETE]: SubscriptionComplete;
  [ERROR_MESSAGE]: ErrorMessage;
};
type ResponseKeys = keyof MessageResponses;
export type MessageResponseTypes = MessageResponses[ResponseKeys];

// Event Kind to Message Structure
type Messages = MessageRequests & MessageResponses;
export type EventMap =
  & {
    [key in keyof Messages]: [Messages[key]];
  }
  & {
    [REQUEST_KEY]: [MessageRequests[RequestKeys]];
    [RESPONSE_KEY]: [MessageResponses[ResponseKeys]];
  };

// Response Type Guard
const RESPONSE_KEYS = [
  CONNECTION_READY,
  CONNECTION_ERROR,
  CONNECTION_KEEP_ALIVE,
  SUBSCRIPTION_READY,
  SUBSCRIPTION_DATA,
  SUBSCRIPTION_COMPLETE,
  ERROR_MESSAGE,
];

export function isResponse(evt: any): evt is MessageResponseTypes {
  return RESPONSE_KEYS.includes((evt as MessageResponseTypes).type);
}
