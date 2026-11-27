// Reads the field and oneof options that shape the domain types:
//   - (talaagent.domain.v1.field): brand, date form, required
//   - (buf.validate.field): required, and string min_len / len
//   - (buf.validate.oneof): required
//
// The extensions are looked up in a registry over every file of the request,
// so the plugin needs no generated code for them: buf passes the imports of a
// file along with it. getExtension decodes the options' unknown fields.

import {
  createRegistry,
  type DescField,
  type DescFile,
  type DescOneof,
  getExtension,
  hasExtension,
  type Registry,
} from "@bufbuild/protobuf";

const DOMAIN_FIELD = "talaagent.domain.v1.field";
const VALIDATE_FIELD = "buf.validate.field";
const VALIDATE_ONEOF = "buf.validate.oneof";

/** Values of talaagent.domain.v1.DateForm. */
export const DateForm = {
  UNSPECIFIED: 0,
  FULL: 1,
  YEAR_MONTH: 2,
  MONTH_DAY: 3,
} as const;

export type DateFormValue = (typeof DateForm)[keyof typeof DateForm];

export interface DomainFieldOptions {
  readonly brand: string | undefined;
  readonly date: DateFormValue;
  readonly required: boolean;
}

function hasProp<K extends string>(object: unknown, key: K): object is Record<K, unknown> {
  return typeof object === "object" && object !== null && key in object;
}

function isDateForm(value: unknown): value is DateFormValue {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function buildRegistry(files: readonly DescFile[]): Registry {
  return createRegistry(...files);
}

function readExtension(registry: Registry, name: string, desc: DescField | DescOneof): unknown {
  const extension = registry.getExtension(name);
  const options = desc.proto.options;
  if (extension === undefined || options === undefined) {
    return undefined;
  }
  // The registry's extensions extend the descriptor.proto it was built from.
  if (!hasExtension(options, extension)) {
    return undefined;
  }
  return getExtension(options, extension);
}

export function domainFieldOptions(registry: Registry, field: DescField): DomainFieldOptions {
  const value = readExtension(registry, DOMAIN_FIELD, field);
  const brand =
    hasProp(value, "brand") && typeof value.brand === "string" && value.brand !== ""
      ? value.brand
      : undefined;
  const date = hasProp(value, "date") && isDateForm(value.date) ? value.date : DateForm.UNSPECIFIED;
  const required = hasProp(value, "required") && value.required === true;
  return { brand, date, required };
}

/** `(buf.validate.field).required = true`. */
export function validateRequired(registry: Registry, field: DescField): boolean {
  const rules = readExtension(registry, VALIDATE_FIELD, field);
  return hasProp(rules, "required") && rules.required === true;
}

/** `(buf.validate.oneof).required = true`. */
export function oneofRequired(registry: Registry, oneof: DescOneof): boolean {
  const rules = readExtension(registry, VALIDATE_ONEOF, oneof);
  return hasProp(rules, "required") && rules.required === true;
}

/**
 * A string rule that rules out "": `string.min_len` or `string.len` of at
 * least 1. The rules hold their type-specific part in the `type` oneof.
 */
export function nonEmptyStringRule(registry: Registry, field: DescField): boolean {
  const rules = readExtension(registry, VALIDATE_FIELD, field);
  if (!hasProp(rules, "type")) {
    return false;
  }
  const type = rules.type;
  if (!hasProp(type, "case") || type.case !== "string" || !hasProp(type, "value")) {
    return false;
  }
  const stringRules = type.value;
  const atLeastOne = (length: unknown): boolean =>
    (typeof length === "bigint" && length >= 1n) || (typeof length === "number" && length >= 1);
  return (
    (hasProp(stringRules, "minLen") && atLeastOne(stringRules.minLen)) ||
    (hasProp(stringRules, "len") && atLeastOne(stringRules.len))
  );
}
