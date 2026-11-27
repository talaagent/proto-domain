// ConnectRPC clients over the generated codecs: a client whose responses are
// validated (and typed as MessageValidType), and a client that speaks domain
// types.

import type {
  DescMethodServerStreaming,
  DescMethodUnary,
  DescService,
  MessageInitShape,
  MessageValidType,
} from "@bufbuild/protobuf";
import type { Validator } from "@bufbuild/protovalidate";
import { type CallOptions, type Client, createClient, type Transport } from "@connectrpc/connect";
import type { ServiceCodecs } from "./types.js";
import { validateMessage } from "./validate.js";

/**
 * A connect-es `Client<S>` whose unary and server-streaming responses are
 * typed as their MessageValidType: a field that protovalidate marks
 * `required` is non-optional. Client- and bidi-streaming methods keep their
 * Client types.
 */
export type ValidatedClient<S extends DescService> = {
  [K in keyof Client<S>]: S["method"][K] extends DescMethodUnary<infer I, infer O>
    ? (request: MessageInitShape<I>, options?: CallOptions) => Promise<MessageValidType<O>>
    : S["method"][K] extends DescMethodServerStreaming<infer I, infer O>
      ? (request: MessageInitShape<I>, options?: CallOptions) => AsyncIterable<MessageValidType<O>>
      : Client<S>[K];
};

/** Options for {@link createValidatedClient}. */
export interface ValidatedClientOptions {
  /** The protovalidate validator; by default a shared one from `createValidator()`. */
  readonly validator?: Validator;
}

type Call = (request: unknown, options?: CallOptions) => unknown;

/**
 * A client for `service` that validates every unary and server-streaming
 * response with protovalidate before returning it, throwing protovalidate's
 * ValidationError on a response that breaks its rules.
 */
export function createValidatedClient<S extends DescService>(
  service: S,
  transport: Transport,
  options: ValidatedClientOptions = {},
): ValidatedClient<S> {
  const client = createClient(service, transport);
  const { validator } = options;
  const validated: Record<string, Call> = {};
  for (const method of service.methods) {
    const call = Reflect.get(client, method.localName) as Call;
    switch (method.methodKind) {
      case "unary":
        validated[method.localName] = async (request, callOptions) =>
          validateMessage(
            method.output,
            await (call(request, callOptions) as Promise<never>),
            validator,
          );
        break;
      case "server_streaming":
        validated[method.localName] = (request, callOptions) =>
          validateStream(call(request, callOptions) as AsyncIterable<never>, (message) =>
            validateMessage(method.output, message, validator),
          );
        break;
      default:
        validated[method.localName] = call;
    }
  }
  return validated as ValidatedClient<S>;
}

async function* validateStream<T, Valid>(
  messages: AsyncIterable<T>,
  validate: (message: T) => Valid,
): AsyncIterable<Valid> {
  for await (const message of messages) {
    yield validate(message);
  }
}

/** The client methods {@link createDomainClient} needs: one per codec, taking and giving wire messages. */
export type WireClientFor<C extends ServiceCodecs> = {
  readonly [K in keyof C]: (
    request: ReturnType<C[K]["requestToProto"]>,
    options?: CallOptions,
  ) => Promise<Parameters<C[K]["responseFromProto"]>[0]>;
};

/** A client that takes domain requests (DomainInit) and gives domain responses. */
export type DomainClient<C extends ServiceCodecs> = {
  readonly [K in keyof C]: (
    request: Parameters<C[K]["requestToProto"]>[0],
    options?: CallOptions,
  ) => Promise<ReturnType<C[K]["responseFromProto"]>>;
};

/**
 * A domain client over a wire client and a generated `<Service>Codecs` map:
 * each method encodes its domain request, calls the wire method and decodes
 * the response. Give it a `createValidatedClient` client to validate the
 * responses first.
 *
 * ```ts
 * const tasks = createDomainClient(createValidatedClient(TaskService, transport), TaskServiceCodecs);
 * const { task } = await tasks.createTask({ title: "Write docs" });
 * ```
 */
export function createDomainClient<C extends ServiceCodecs>(
  client: WireClientFor<NoInfer<C>>,
  codecs: C,
): DomainClient<C> {
  const domain: Record<string, Call> = {};
  for (const [name, codec] of Object.entries(codecs)) {
    const call = Reflect.get(client, name) as Call;
    const encode = codec.requestToProto as (request: unknown) => unknown;
    const decode = codec.responseFromProto as (response: unknown) => unknown;
    domain[name] = async (request, options) => decode(await call(encode(request), options));
  }
  return domain as DomainClient<C>;
}
