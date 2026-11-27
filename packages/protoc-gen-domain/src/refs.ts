// Names and imports used by the emitted code.

import type { DescEnum, DescFile, DescMessage, Registry } from "@bufbuild/protobuf";
import type { GeneratedFile, ImportSymbol, Printable } from "@bufbuild/protoplugin";

import type { Options } from "./options.js";

/** Everything an emitter needs about the file it is writing. */
export interface GenContext {
  readonly f: GeneratedFile;
  readonly file: DescFile;
  readonly options: Options;
  readonly registry: Registry;
  /** Whether a domain type and codecs are generated for the message or enum. */
  readonly generated: (desc: DescMessage | DescEnum) => boolean;
}

/** The output file of a proto file: `example/v1/task.proto` gives `example/v1/task_domain.ts`. */
export function domainFileName(file: DescFile): string {
  return `${file.name}_domain.ts`;
}

function domainImportPath(file: DescFile): string {
  return `./${file.name}_domain.js`;
}

export function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** The domain type name of a message or enum: protobuf-es's name for it. */
export function domainName(ctx: GenContext, desc: DescMessage | DescEnum): string {
  return ctx.f.importShape(desc).name;
}

/** A codec function's name: `taskFromProto`, `task_ItemToProto`. */
export function codecName(
  ctx: GenContext,
  desc: DescMessage | DescEnum,
  direction: Direction,
): string {
  return `${lowerFirst(domainName(ctx, desc))}${direction}`;
}

export type Direction = "FromProto" | "ToProto";

/** A domain type, by name in its own file and imported from another. */
export function domainTypeRef(ctx: GenContext, desc: DescMessage | DescEnum): Printable {
  const name = domainName(ctx, desc);
  return desc.file === ctx.file ? name : ctx.f.import(name, domainImportPath(desc.file), true);
}

/** A codec function, by name in its own file and imported from another. */
export function codecRef(
  ctx: GenContext,
  desc: DescMessage | DescEnum,
  direction: Direction,
): Printable {
  const name = codecName(ctx, desc, direction);
  return desc.file === ctx.file ? name : ctx.f.import(name, domainImportPath(desc.file));
}

/** A value export of the runtime: a converter, `req`, `DomainDecodeError`. */
export function runtimeValue(ctx: GenContext, name: string): ImportSymbol {
  return ctx.f.import(name, ctx.options.runtimeImport);
}

/** A type export of the runtime: `DomainInit`, `Brand`, `Interval`. */
export function runtimeType(ctx: GenContext, name: string): ImportSymbol {
  return ctx.f.import(name, ctx.options.runtimeImport, true);
}

/** A member of the Temporal namespace, e.g. `Temporal.Instant`, as a type. */
export function temporalType(ctx: GenContext, member: string): Printable {
  return [runtimeType(ctx, "Temporal"), ".", member];
}

/** protobuf-es's generated enum, as a value (to name its members). */
export function wireEnumValue(ctx: GenContext, desc: DescEnum): ImportSymbol {
  const shape = ctx.f.importShape(desc);
  return ctx.f.import(shape.name, shape.from);
}
