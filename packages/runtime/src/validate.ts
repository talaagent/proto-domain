// Validate wire messages with protovalidate, narrowing them to their
// MessageValidType (required message fields become non-optional), and compose
// that with a domain decoder for a connect-query / TanStack Query `select`.

import type { DescMessage, MessageShape, MessageValidType } from "@bufbuild/protobuf";
import { createValidator, type Validator } from "@bufbuild/protovalidate";

let sharedValidator: Validator | undefined;

// Created on first use, so importing this module costs nothing.
function defaultValidator(): Validator {
  sharedValidator ??= createValidator();
  return sharedValidator;
}

/**
 * The message, typed as its MessageValidType when it passes its
 * protovalidate rules. Throws protovalidate's ValidationError when it breaks
 * one, and its CompilationError or RuntimeError when a rule can't be evaluated.
 * Without a `validator`, a shared default one is used.
 */
export function validateMessage<Desc extends DescMessage>(
  schema: Desc,
  message: MessageShape<Desc>,
  validator: Validator = defaultValidator(),
): MessageValidType<Desc> {
  const result = validator.validate(schema, message);
  if (result.kind === "valid") {
    return result.message;
  }
  throw result.error;
}

/**
 * A function that validates a message, then decodes it: give it to
 * connect-query's `useQuery(method, input, { select })` with the method's
 * output schema and the generated `<message>FromProto`, so `data` is the
 * domain type.
 *
 * ```ts
 * useQuery(getTask, { id }, { select: validateThen(GetTaskResponseSchema, getTaskResponseFromProto) });
 * ```
 */
export function validateThen<Desc extends DescMessage, Domain>(
  schema: Desc,
  decode: (message: MessageValidType<Desc>) => Domain,
  validator?: Validator,
): (message: MessageShape<Desc>) => Domain {
  return (message) => decode(validateMessage(schema, message, validator));
}
