export class DosprobeError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'DosprobeError';
    this.code = code;
  }
}

export class ConnectionError extends DosprobeError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}

export class TimeoutError extends DosprobeError {
  constructor(message: string) {
    super(message, 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}

export class ProtocolError extends DosprobeError {
  constructor(message: string) {
    super(message, 'PROTOCOL_ERROR');
    this.name = 'ProtocolError';
  }
}

export class BackendNotRunning extends DosprobeError {
  constructor() {
    super('No backend is running', 'BACKEND_NOT_RUNNING');
    this.name = 'BackendNotRunning';
  }
}
