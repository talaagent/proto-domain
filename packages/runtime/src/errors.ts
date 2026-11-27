/**
 * A wire value the domain type can't hold: a required field that is unset, an
 * unknown enum number, a partial date where a full one was declared.
 */
export class DomainDecodeError extends Error {
  /** Where the value sits, e.g. `example.v1.Task.due_date`. */
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`);
    this.name = "DomainDecodeError";
    this.path = path;
  }
}

/**
 * A domain value the wire type can't hold: a Temporal.Duration with days for a
 * google.protobuf.Duration, a date in a non-ISO calendar.
 */
export class DomainEncodeError extends Error {
  /** What was being encoded, e.g. `Temporal.Duration`. */
  readonly what: string;

  constructor(what: string, reason: string) {
    super(`${what}: ${reason}`);
    this.name = "DomainEncodeError";
    this.what = what;
  }
}

/** The message of a caught error, for a wrapping error's reason. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
