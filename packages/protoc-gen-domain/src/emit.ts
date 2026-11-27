// Emits the domain declarations of one file: per enum a string-literal union
// and its codecs, per message an interface and fromProto / toProto, and per
// service a `<Service>Codecs` map of its unary methods.
//
// Top-level names are declared with f.export(), so protoplugin reserves them
// and aliases a same-named protobuf-es import (the wire `Task` becomes
// `Task$1` next to the domain `Task`).

import type { DescEnum, DescEnumValue, DescMessage, DescService } from "@bufbuild/protobuf";
import type { Printable } from "@bufbuild/protoplugin";

import { fieldPlan, hasUnspecified, type MemberPlan, oneofPlan } from "./convert.js";
import type { EnumStyle } from "./options.js";
import {
  codecName,
  codecRef,
  domainName,
  type GenContext,
  runtimeType,
  runtimeValue,
  wireEnumValue,
} from "./refs.js";

/** The string literal of an enum value: `IN_PROGRESS` as `in_progress`, `IN_PROGRESS` or `inProgress`. */
export function enumLiteral(value: DescEnumValue, style: EnumStyle): string {
  // protobuf-es's local name drops the prefix the values share (TASK_STATUS_).
  const name = value.localName.replace(/^_+/, "");
  switch (style) {
    case "screaming":
      return name;
    case "snake":
      return name.toLowerCase();
    case "camel":
      return name
        .toLowerCase()
        .replace(/_+([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());
  }
}

export function emitEnum(ctx: GenContext, desc: DescEnum): void {
  const { f } = ctx;
  const name = domainName(ctx, desc);
  const wire = wireEnumValue(ctx, desc);
  const nullable = hasUnspecified(desc);
  // The values the union holds, first name per number (aliases share one).
  const values = desc.values.filter((value) => !(nullable && value.number === 0));
  const literals = new Map<string, DescEnumValue>();
  for (const value of values) {
    const literal = enumLiteral(value, ctx.options.enumStyle);
    const other = literals.get(literal);
    if (other !== undefined && other.number !== value.number) {
      throw new Error(`${desc.typeName}: ${other.name} and ${value.name} both become "${literal}"`);
    }
    literals.set(literal, value);
  }
  const byNumber = new Map<number, string>();
  for (const [literal, value] of literals) {
    if (!byNumber.has(value.number)) {
      byNumber.set(value.number, literal);
    }
  }

  f.print(f.jsDoc(desc));
  const union: Printable[] = [];
  if (literals.size === 0) {
    union.push(" never");
  }
  for (const literal of literals.keys()) {
    union.push("\n  | ", f.string(literal));
  }
  f.print(f.export("type", name), " =", union, ";");
  f.print();

  const domainType: Printable = nullable ? [name, " | null"] : name;
  f.print("/**");
  f.print(
    ` * The ${desc.typeName} wire value as its domain value${nullable ? ", null for the unspecified value" : ""}.`,
  );
  f.print(" * Throws a DomainDecodeError for a number the enum doesn't define.");
  f.print(" */");
  f.print(
    f.export("function", codecName(ctx, desc, "FromProto")),
    "(value: ",
    wire,
    ", path: string): ",
    domainType,
    " {",
  );
  f.print("  switch (value) {");
  if (nullable) {
    f.print("    case 0:");
    f.print("      return null;");
  }
  for (const [number, literal] of byNumber) {
    f.print("    case ", number, ":");
    f.print("      return ", f.string(literal), ";");
  }
  f.print("    default:");
  f.print(
    "      throw new ",
    runtimeValue(ctx, "DomainDecodeError"),
    "(path, ",
    f.string(`unknown ${desc.typeName} value `),
    " + String(value));",
  );
  f.print("  }");
  f.print("}");
  f.print();

  f.print(`/** A domain value as its ${desc.typeName} wire value. */`);
  f.print(
    f.export("function", codecName(ctx, desc, "ToProto")),
    "(value: ",
    domainType,
    "): ",
    wire,
    " {",
  );
  f.print("  switch (value) {");
  if (nullable) {
    f.print("    case null:");
    f.print(
      "      return ",
      wire,
      ".",
      desc.values.find((value) => value.number === 0)?.localName ?? "",
      ";",
    );
  }
  for (const [literal, value] of literals) {
    f.print("    case ", f.string(literal), ":");
    f.print("      return ", wire, ".", value.localName, ";");
  }
  f.print("  }");
  f.print("}");
  f.print();
}

function memberPlans(ctx: GenContext, message: DescMessage): MemberPlan[] {
  return message.members.map((member) =>
    member.kind === "oneof" ? oneofPlan(ctx, member) : fieldPlan(ctx, member),
  );
}

export function emitMessage(ctx: GenContext, message: DescMessage): void {
  const { f } = ctx;
  const name = domainName(ctx, message);
  const wire = f.importShape(message);
  const plans = memberPlans(ctx, message);

  f.print(f.jsDoc(message));
  f.print(f.export("interface", name), " {");
  for (const [index, member] of message.members.entries()) {
    const plan = plans[index];
    if (plan === undefined) {
      continue;
    }
    f.print(f.jsDoc(member, "  "));
    f.print("  readonly ", plan.name, ": ", plan.type, ";");
  }
  f.print("}");
  f.print();

  const input = plans.length === 0 ? "_input" : "input";
  f.print(
    `/** A ${message.typeName} as its domain type. Throws a DomainDecodeError for a value the domain type can't hold. */`,
  );
  f.print(
    f.export("function", codecName(ctx, message, "FromProto")),
    "(",
    input,
    ": ",
    wire,
    "): ",
    name,
    " {",
  );
  f.print("  return {");
  for (const plan of plans) {
    f.print("    ", plan.name, ": ", plan.from, ",");
  }
  f.print("  };");
  f.print("}");
  f.print();

  const value = plans.length === 0 ? "_value" : "value";
  f.print(`/** A domain value as a ${message.typeName}. Nullable properties may be left out. */`);
  f.print(
    f.export("function", codecName(ctx, message, "ToProto")),
    "(",
    value,
    ": ",
    runtimeType(ctx, "DomainInit"),
    "<",
    name,
    ">): ",
    wire,
    " {",
  );
  f.print("  return ", f.runtime.create, "(", f.importSchema(message), ", {");
  for (const plan of plans) {
    f.print("    ", plan.name, ": ", plan.to, ",");
  }
  f.print("  });");
  f.print("}");
  f.print();
}

/**
 * `<Service>Codecs`: per unary method, keyed by its local name, the request
 * encoder and the response decoder. Streaming methods are left out, and so is
 * a method whose request or response has no generated codecs (e.g.
 * google.protobuf.Empty).
 *
 * The type is spelled out with `typeof` so the file builds under
 * isolatedDeclarations and each entry keeps its precise function types.
 */
export function emitServiceCodecs(ctx: GenContext, service: DescService): void {
  const { f } = ctx;
  const entries = service.methods
    .filter(
      (method) =>
        method.methodKind === "unary" &&
        ctx.generated(method.input) &&
        ctx.generated(method.output),
    )
    .map((method) => ({
      key: method.localName,
      request: codecRef(ctx, method.input, "ToProto"),
      response: codecRef(ctx, method.output, "FromProto"),
    }));
  if (entries.length === 0) {
    return;
  }
  f.print(
    `/** The domain codecs of ${service.typeName}'s unary methods, for createDomainClient. */`,
  );
  f.print(f.export("const", `${service.name}Codecs`), ": {");
  for (const { key, request, response } of entries) {
    f.print("  readonly ", key, ": {");
    f.print("    readonly requestToProto: typeof ", request, ";");
    f.print("    readonly responseFromProto: typeof ", response, ";");
    f.print("  };");
  }
  f.print("} = {");
  for (const { key, request, response } of entries) {
    f.print("  ", key, ": {");
    f.print("    requestToProto: ", request, ",");
    f.print("    responseFromProto: ", response, ",");
    f.print("  },");
  }
  f.print("};");
  f.print();
}
