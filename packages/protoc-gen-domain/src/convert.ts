// How each field maps onto its domain type, and the expressions that convert
// a protobuf-es value to it and back.
//
// A Conv maps one element: a singular value, or one entry of a list or map.
// fieldPlan wraps it for presence, lists, maps and nullability; oneofPlan
// builds the flat discriminated union of a oneof.

import {
  type DescEnum,
  type DescField,
  type DescMessage,
  type DescOneof,
  ScalarType,
} from "@bufbuild/protobuf";
import { scalarTypeScriptType } from "@bufbuild/protobuf/codegenv2";
import { FeatureSet_FieldPresence, isWrapperDesc, StructSchema } from "@bufbuild/protobuf/wkt";
import type { Printable } from "@bufbuild/protoplugin";

import {
  DateForm,
  type DomainFieldOptions,
  domainFieldOptions,
  nonEmptyStringRule,
  oneofRequired,
  validateRequired,
} from "./extensions.js";
import {
  codecRef,
  domainTypeRef,
  type GenContext,
  runtimeType,
  runtimeValue,
  temporalType,
} from "./refs.js";

/** One element's mapping. */
interface Conv {
  /** The domain type of a present value, without `| null`. */
  readonly type: Printable;
  /**
   * Whether decoding a present wire value can give null (an UNSPECIFIED enum
   * value, DayOfWeek 0), so `to` takes null (and undefined) too.
   */
  readonly decodesNull: boolean;
  /** Wire value to domain value. `path` labels errors. */
  readonly from: (src: Printable, path: string) => Printable;
  /** Domain value to the wire value or init. */
  readonly to: (dom: Printable) => Printable;
  /** `from` and `to` return their argument (perhaps cast): lists and maps copy instead of mapping. */
  readonly identity: boolean;
}

/** A property of the domain interface and its two conversions. */
export interface MemberPlan {
  readonly name: string;
  readonly type: Printable;
  /** The property in `fromProto`'s object literal. */
  readonly from: Printable;
  /** The property in `toProto`'s init object. */
  readonly to: Printable;
}

/** A thrown error that names the field, for proto files the plugin can't map. */
function fieldError(field: DescField, reason: string): Error {
  return new Error(`${field.parent.typeName}.${field.name}: ${reason}`);
}

function call(fn: Printable, ...args: Printable[]): Printable {
  const out: Printable[] = [fn, "("];
  for (const [index, arg] of args.entries()) {
    if (index > 0) {
      out.push(", ");
    }
    out.push(arg);
  }
  out.push(")");
  return out;
}

// --- scalars -----------------------------------------------------------------

function scalarType(scalar: ScalarType, longAsString: boolean): string {
  return scalarTypeScriptType(scalar, longAsString);
}

function plainConv(type: Printable): Conv {
  return {
    type,
    decodesNull: false,
    from: (src) => src,
    to: (dom) => dom,
    identity: true,
  };
}

const BRAND_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function brandType(ctx: GenContext, field: DescField, base: string, brand: string): Printable {
  if (!BRAND_NAME.test(brand)) {
    throw fieldError(field, `brand "${brand}" is not a TypeScript identifier`);
  }
  if (ctx.options.brandImport !== undefined) {
    return ctx.f.import(brand, ctx.options.brandImport, true);
  }
  return [runtimeType(ctx, "Brand"), "<", base, ", ", ctx.f.string(brand), ">"];
}

function scalarConv(
  ctx: GenContext,
  field: DescField,
  scalar: ScalarType,
  brand: string | undefined,
): Conv {
  const longAsString =
    field.fieldKind === "scalar" || (field.fieldKind === "list" && field.listKind === "scalar")
      ? field.longAsString
      : false;
  const base = scalarType(scalar, longAsString);
  if (brand === undefined) {
    return plainConv(base);
  }
  if (scalar === ScalarType.BOOL || scalar === ScalarType.DOUBLE || scalar === ScalarType.FLOAT) {
    throw fieldError(field, "a brand needs a string, bytes or integer field");
  }
  const type = brandType(ctx, field, base, brand);
  return {
    type,
    decodesNull: false,
    from: (src) => ["(", src, " as ", type, ")"],
    to: (dom) => dom,
    identity: true,
  };
}

/**
 * An implicit-presence string that isn't required: "" on the wire (which is
 * also what an unset field reads as) is null in the domain, and null encodes
 * as "".
 */
function emptyStringConv(inner: Conv): Conv {
  return {
    type: inner.type,
    decodesNull: true,
    from: (src, path) => [src, ' === "" ? null : ', inner.from(src, path)],
    to: (dom) => [dom, ' ?? ""'],
    identity: false,
  };
}

// --- enums -------------------------------------------------------------------

/** The enum's zero value is "unspecified": it decodes to null and isn't in the union. */
export function hasUnspecified(desc: DescEnum): boolean {
  const zero = desc.values.find((value) => value.number === 0);
  return zero !== undefined && /(^|_)UNSPECIFIED$/.test(zero.name);
}

function enumConv(ctx: GenContext, desc: DescEnum): Conv {
  switch (desc.typeName) {
    case "google.type.DayOfWeek":
      return runtimeNullableNumberConv(ctx, "DayOfWeekNumber", "dayOfWeek");
    case "google.type.Month":
      return runtimeNullableNumberConv(ctx, "MonthNumber", "month");
  }
  if (!ctx.generated(desc)) {
    // A foreign enum (google.type.CalendarPeriod, ...): the protobuf-es enum.
    return plainConv(ctx.f.importShape(desc));
  }
  const decodesNull = hasUnspecified(desc);
  return {
    type: domainTypeRef(ctx, desc),
    decodesNull,
    from: (src, path) => call(codecRef(ctx, desc, "FromProto"), src, ctx.f.string(path)),
    to: (dom) => call(codecRef(ctx, desc, "ToProto"), decodesNull ? [dom, " ?? null"] : dom),
    identity: false,
  };
}

function runtimeNullableNumberConv(ctx: GenContext, typeName: string, prefix: string): Conv {
  return {
    type: runtimeType(ctx, typeName),
    decodesNull: true,
    from: (src, path) => call(runtimeValue(ctx, `${prefix}FromProto`), src, ctx.f.string(path)),
    to: (dom) => call(runtimeValue(ctx, `${prefix}ToProto`), [dom, " ?? null"]),
    identity: false,
  };
}

// --- messages ----------------------------------------------------------------

/** A message the runtime converts: `<prefix>FromProto(src, path)` and `<prefix>ToProto(dom)`. */
function runtimeMessageConv(ctx: GenContext, type: Printable, prefix: string): Conv {
  return {
    type,
    decodesNull: false,
    from: (src, path) => call(runtimeValue(ctx, `${prefix}FromProto`), src, ctx.f.string(path)),
    to: (dom) => call(runtimeValue(ctx, `${prefix}ToProto`), dom),
    identity: false,
  };
}

function dateConv(ctx: GenContext, field: DescField, options: DomainFieldOptions): Conv {
  switch (options.date) {
    case DateForm.UNSPECIFIED:
    case DateForm.FULL:
      return runtimeMessageConv(ctx, temporalType(ctx, "PlainDate"), "date");
    case DateForm.YEAR_MONTH:
      return runtimeMessageConv(ctx, temporalType(ctx, "PlainYearMonth"), "yearMonth");
    case DateForm.MONTH_DAY:
      return runtimeMessageConv(ctx, temporalType(ctx, "PlainMonthDay"), "monthDay");
    default:
      throw fieldError(field, `unknown date form ${String(options.date)}`);
  }
}

function mappedMessageConv(
  ctx: GenContext,
  field: DescField,
  message: DescMessage,
  options: DomainFieldOptions,
): Conv | undefined {
  switch (message.typeName) {
    case "google.protobuf.Timestamp":
      return runtimeMessageConv(ctx, temporalType(ctx, "Instant"), "timestamp");
    case "google.protobuf.Duration":
      return runtimeMessageConv(ctx, temporalType(ctx, "Duration"), "duration");
    case "talaagent.domain.v1.CalendarDuration":
      return runtimeMessageConv(ctx, temporalType(ctx, "Duration"), "calendarDuration");
    case "google.type.Date":
      return dateConv(ctx, field, options);
    case "google.type.TimeOfDay":
      return runtimeMessageConv(ctx, temporalType(ctx, "PlainTime"), "timeOfDay");
    case "google.type.DateTime":
      return runtimeMessageConv(
        ctx,
        [temporalType(ctx, "ZonedDateTime"), " | ", temporalType(ctx, "PlainDateTime")],
        "dateTime",
      );
    case "google.type.TimeZone":
      return runtimeMessageConv(ctx, "string", "timeZone");
    case "google.type.Interval":
      return runtimeMessageConv(ctx, runtimeType(ctx, "Interval"), "interval");
    case "google.type.LatLng":
      return runtimeMessageConv(ctx, runtimeType(ctx, "LatLng"), "latLng");
    case "google.type.Decimal":
      return runtimeMessageConv(ctx, "string", "decimal");
    case StructSchema.typeName:
      // protobuf-es already gives a Struct as a JsonObject.
      return plainConv(ctx.f.import("JsonObject", "@bufbuild/protobuf", true));
  }
  return undefined;
}

function messageConv(
  ctx: GenContext,
  field: DescField,
  message: DescMessage,
  options: DomainFieldOptions,
): Conv {
  const mapped = mappedMessageConv(ctx, field, message, options);
  if (mapped !== undefined) {
    return mapped;
  }
  if (!ctx.generated(message)) {
    // PhoneNumber, Money, Any, ...: the protobuf-es message, as is.
    return plainConv(ctx.f.importShape(message));
  }
  return {
    type: domainTypeRef(ctx, message),
    decodesNull: false,
    from: (src) => call(codecRef(ctx, message, "FromProto"), src),
    to: (dom) => call(codecRef(ctx, message, "ToProto"), dom),
    identity: false,
  };
}

// --- fields ------------------------------------------------------------------

type ElementKind =
  | { readonly kind: "scalar"; readonly scalar: ScalarType }
  | { readonly kind: "enum"; readonly desc: DescEnum }
  | { readonly kind: "message"; readonly desc: DescMessage };

function elementOf(field: DescField): ElementKind {
  switch (field.fieldKind) {
    case "scalar":
      return { kind: "scalar", scalar: field.scalar };
    case "enum":
      return { kind: "enum", desc: field.enum };
    case "message":
      return { kind: "message", desc: field.message };
    case "list":
      switch (field.listKind) {
        case "scalar":
          return { kind: "scalar", scalar: field.scalar };
        case "enum":
          return { kind: "enum", desc: field.enum };
        case "message":
          return { kind: "message", desc: field.message };
      }
      break;
    case "map":
      switch (field.mapKind) {
        case "scalar":
          return { kind: "scalar", scalar: field.scalar };
        case "enum":
          return { kind: "enum", desc: field.enum };
        case "message":
          return { kind: "message", desc: field.message };
      }
      break;
  }
  throw fieldError(field, "unknown field kind");
}

function checkOptions(field: DescField, element: ElementKind, options: DomainFieldOptions): void {
  if (
    options.date !== DateForm.UNSPECIFIED &&
    !(element.kind === "message" && element.desc.typeName === "google.type.Date")
  ) {
    throw fieldError(
      field,
      "(talaagent.domain.v1.field).date is only valid on a google.type.Date field",
    );
  }
  // A singular wrapper is unboxed to its scalar, so it takes a brand too.
  const unboxed = field.fieldKind === "message" && isWrapperDesc(field.message);
  if (options.brand !== undefined && element.kind !== "scalar" && !unboxed) {
    throw fieldError(
      field,
      "(talaagent.domain.v1.field).brand is only valid on a scalar or wrapper field",
    );
  }
}

function elementConv(
  ctx: GenContext,
  field: DescField,
  element: ElementKind,
  options: DomainFieldOptions,
): Conv {
  switch (element.kind) {
    case "scalar":
      return scalarConv(ctx, field, element.scalar, options.brand);
    case "enum":
      return enumConv(ctx, element.desc);
    case "message":
      return messageConv(ctx, field, element.desc, options);
  }
}

/** A list or map element: a null from decoding (an UNSPECIFIED enum) is an error. */
function requiredElement(ctx: GenContext, conv: Conv): Conv {
  if (!conv.decodesNull) {
    return conv;
  }
  return {
    ...conv,
    decodesNull: false,
    from: (src, path) => call(runtimeValue(ctx, "req"), conv.from(src, path), ctx.f.string(path)),
  };
}

function fieldPath(field: DescField): string {
  return `${field.parent.typeName}.${field.name}`;
}

export function fieldPlan(ctx: GenContext, field: DescField): MemberPlan {
  const name = field.localName;
  const src = `input.${name}`;
  const dom = `value.${name}`;
  const path = fieldPath(field);
  const options = domainFieldOptions(ctx.registry, field);
  const element = elementOf(field);
  checkOptions(field, element, options);

  if (field.fieldKind === "list") {
    const conv = requiredElement(ctx, elementConv(ctx, field, element, options));
    const elementPath = `${path}[]`;
    return {
      name,
      type: ["readonly ", wrapUnion(conv.type), "[]"],
      from:
        conv.identity && options.brand === undefined
          ? src
          : [src, ".map((entry) => ", conv.from("entry", elementPath), ")"],
      to: conv.identity ? ["[...", dom, "]"] : [dom, ".map((entry) => ", conv.to("entry"), ")"],
    };
  }

  if (field.fieldKind === "map") {
    const conv = requiredElement(ctx, elementConv(ctx, field, element, options));
    const keyType = mapKeyType(field.mapKey);
    const entryPath = `${path}{}`;
    return {
      name,
      type: ["{ readonly [key: ", keyType, "]: ", conv.type, " }"],
      from:
        conv.identity && options.brand === undefined
          ? src
          : mapEntries(src, conv.from("entry", entryPath)),
      to: conv.identity ? ["{ ...", dom, " }"] : mapEntries(dom, conv.to("entry")),
    };
  }

  const required = options.required || validateRequired(ctx.registry, field);
  // A singular wrapper (StringValue, ...) is unboxed by protobuf-es: its scalar, or undefined.
  const wrapped =
    field.fieldKind === "message" && isWrapperDesc(field.message)
      ? field.message.fields[0]
      : undefined;
  let conv: Conv;
  let explicit: boolean;
  if (wrapped !== undefined && wrapped.fieldKind === "scalar") {
    conv = scalarConv(ctx, field, wrapped.scalar, options.brand);
    explicit = true;
  } else {
    conv = elementConv(ctx, field, element, options);
    // protobuf-es types a message field, and a proto3 `optional` scalar or
    // enum, as possibly undefined. Other explicit-presence fields (proto2,
    // editions) read as their default when unset, like implicit ones.
    explicit = field.fieldKind === "message" || field.proto.proto3Optional === true;
  }

  if (explicit) {
    // The wire value may be undefined: null in the domain unless required.
    if (required) {
      const present = call(runtimeValue(ctx, "req"), src, ctx.f.string(path));
      return {
        name,
        type: conv.type,
        from: conv.decodesNull
          ? call(runtimeValue(ctx, "req"), conv.from(present, path), ctx.f.string(path))
          : conv.from(present, path),
        to: conv.to(dom),
      };
    }
    return {
      name,
      type: [wrapUnion(conv.type), " | null"],
      from: [src, " === undefined ? null : ", conv.from(src, path)],
      to: [dom, " == null ? undefined : ", conv.to(dom)],
    };
  }

  // Implicit presence: the wire value is always there.
  if (
    !required &&
    field.fieldKind === "scalar" &&
    field.scalar === ScalarType.STRING &&
    field.presence === FeatureSet_FieldPresence.IMPLICIT &&
    !nonEmptyStringRule(ctx.registry, field)
  ) {
    conv = emptyStringConv(conv);
  }
  if (conv.decodesNull && required) {
    return {
      name,
      type: conv.type,
      from: call(runtimeValue(ctx, "req"), conv.from(src, path), ctx.f.string(path)),
      to: conv.to(dom),
    };
  }
  return {
    name,
    type: conv.decodesNull ? [wrapUnion(conv.type), " | null"] : conv.type,
    from: conv.from(src, path),
    to: conv.to(dom),
  };
}

/** Parenthesize a union type (`A | B`) so `| null` and `[]` apply to all of it. */
function wrapUnion(type: Printable): Printable {
  return Array.isArray(type) && type.some((part) => part === " | ") ? ["(", type, ")"] : type;
}

function mapKeyType(key: ScalarType): string {
  switch (key) {
    case ScalarType.INT32:
    case ScalarType.FIXED32:
    case ScalarType.UINT32:
    case ScalarType.SFIXED32:
    case ScalarType.SINT32:
      return "number";
    default:
      return "string";
  }
}

function mapEntries(object: string, convert: Printable): Printable {
  return [
    "Object.fromEntries(Object.entries(",
    object,
    ").map(([key, entry]) => [key, ",
    convert,
    "]))",
  ];
}

// --- oneofs ------------------------------------------------------------------

/**
 * A oneof is one property holding a flat discriminated union:
 * `{ case: "email"; email: string } | { case: "phone"; phone: PhoneNumber } | null`,
 * null when no member is set (and not null when the oneof is required).
 * proto3 `optional` fields are synthetic oneofs and never come here.
 */
export function oneofPlan(ctx: GenContext, oneof: DescOneof): MemberPlan {
  const name = oneof.localName;
  const src = `input.${name}`;
  const dom = `value.${name}`;
  const path = `${oneof.parent.typeName}.${oneof.name}`;
  const required = oneofRequired(ctx.registry, oneof);
  const members = oneof.fields.map((field) => {
    const options = domainFieldOptions(ctx.registry, field);
    const element = elementOf(field);
    checkOptions(field, element, options);
    // A member is set, so a null from decoding (UNSPECIFIED) is an error.
    return { field, conv: requiredElement(ctx, elementConv(ctx, field, element, options)) };
  });

  const type: Printable[] = [];
  for (const { field, conv } of members) {
    type.push(
      "\n    | { readonly case: ",
      ctx.f.string(field.localName),
      "; readonly ",
      field.localName,
      ": ",
      conv.type,
      " }",
    );
  }
  if (!required) {
    type.push("\n    | null");
  }

  const from: Printable[] = [];
  for (const { field, conv } of members) {
    from.push(
      src,
      ".case === ",
      ctx.f.string(field.localName),
      "\n      ? { case: ",
      ctx.f.string(field.localName),
      ", ",
      field.localName,
      ": ",
      conv.from(`${src}.value`, fieldPath(field)),
      " }\n      : ",
    );
  }
  from.push(required ? call(runtimeValue(ctx, "notSet"), ctx.f.string(path)) : "null");

  const to: Printable[] = [];
  for (const { field, conv } of members) {
    to.push(
      dom,
      "?.case === ",
      ctx.f.string(field.localName),
      "\n      ? { case: ",
      ctx.f.string(field.localName),
      ", value: ",
      conv.to(`${dom}.${field.localName}`),
      " }\n      : ",
    );
  }
  to.push("{ case: undefined }");

  return { name, type, from, to };
}
