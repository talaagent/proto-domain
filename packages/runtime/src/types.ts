import { DomainDecodeError } from "./errors.js";

/** The keys of `T` whose type admits `null`: the domain's optional fields. */
export type NullableKeys<T> = {
  [K in keyof T]-?: null extends T[K] ? K : never;
}[keyof T];

/**
 * What a generated `<message>ToProto` takes: the domain type with each nullable
 * property optional, so a request can leave an absent field out (or pass
 * `undefined`) instead of writing `field: null`. Shallow: a nested message is
 * its full domain type.
 */
export type DomainInit<T> = {
  [K in Exclude<keyof T, NullableKeys<T>>]: T[K];
} & {
  [K in NullableKeys<T>]?: T[K] | undefined;
};

declare const brandSymbol: unique symbol;

/**
 * A nominal type over `T`, from the `(talaagent.domain.v1.field).brand` option:
 * a `Brand<string, "AccountId">` takes no other string. A brand has no runtime
 * cost or check: make one with `value as Brand<string, "AccountId">` where the
 * value is known good, or with a parser of your own.
 */
export type Brand<T, Name extends string> = T & { readonly [brandSymbol]: Name };

/**
 * One unary method's codecs: `requestToProto` encodes a domain request into the
 * wire request, `responseFromProto` decodes the wire response into its domain
 * type. Generated `<Service>Codecs` maps keep each function's precise type;
 * this is the constraint that consumers of such a map accept.
 */
export interface MethodCodec {
  readonly requestToProto: (request: never) => unknown;
  readonly responseFromProto: (response: never) => unknown;
}

/** A generated `<Service>Codecs` map: a method's local name to its codecs. */
export type ServiceCodecs = Readonly<Record<string, MethodCodec>>;

/**
 * A required value: a message field, which protobuf-es types as possibly
 * `undefined`, or a decoded value that came out `null` (an UNSPECIFIED enum, an
 * empty string). Throws a DomainDecodeError when it is absent.
 */
export function req<T>(value: T | undefined | null, path: string): T {
  if (value === undefined || value === null) {
    throw new DomainDecodeError(path, "required field is not set");
  }
  return value;
}
