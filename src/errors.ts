class BaseError extends Error {}

export class NoConnectionError extends BaseError {
  constructor() {
    super("No connection established with websocket.");
  }
}

export class ConnectionFailedError extends BaseError {
  constructor() {
    super("Failed to establish websocket connection.");
  }
}

export class NoTimeoutSet extends BaseError {
  constructor() {
    super("Keep alive timeout not set.");
  }
}

export class TimeoutError extends BaseError {
  constructor(errors: string[] = []) {
    const len = errors.length;
    super(
      len < 1
        ? "Operation timed out."
        : `Operation timed out. Collected ${len} errors: \n` +
          JSON.stringify(errors),
    );
  }
}

export class AuthNotImplementedError extends BaseError {
  constructor() {
    super(`Requested auth type is not implemented.`);
  }
}
