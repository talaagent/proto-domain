// Writes `<file>_domain.ts` next to protobuf-es's `<file>_pb.ts` for every
// proto file of the request that declares a message, an enum or a service.

import type { DescEnum, DescMessage } from "@bufbuild/protobuf";
import type { Schema } from "@bufbuild/protoplugin";

import { emitEnum, emitMessage, emitServiceCodecs } from "./emit.js";
import { buildRegistry } from "./extensions.js";
import type { Options } from "./options.js";
import { domainFileName, type GenContext } from "./refs.js";

/**
 * Packages whose types are mapped by the runtime or passed through, never
 * wrapped: the well-known types, google.type, protovalidate and our options.
 * With `include_imports`, buf hands their files to the plugin too.
 */
export function isForeignPackage(name: string): boolean {
  return (
    name === "talaagent.domain.v1" || name.startsWith("google.") || name.startsWith("buf.validate")
  );
}

export function generateTs(schema: Schema<Options>): void {
  const registry = buildRegistry(schema.allFiles);
  const files = schema.files.filter((file) => !isForeignPackage(file.proto.package));
  // Like protoc-gen-es with its `_pb` files, every file outside the foreign
  // packages is taken to have a `_domain` file: buf's default `directory`
  // strategy runs the plugin once per directory, so a type from another
  // directory isn't in this request but is generated all the same.
  const generated = (desc: DescMessage | DescEnum): boolean =>
    !isForeignPackage(desc.file.proto.package);

  for (const file of files) {
    const types = [...schema.typesInFile(file)];
    const enums = types.filter((type): type is DescEnum => type.kind === "enum");
    // Map entries are synthetic messages: maps are handled as fields.
    const messages = types.filter(
      (type): type is DescMessage =>
        type.kind === "message" && type.proto.options?.mapEntry !== true,
    );
    if (enums.length === 0 && messages.length === 0 && file.services.length === 0) {
      continue;
    }
    const f = schema.generateFile(domainFileName(file));
    f.preamble(file);
    const ctx: GenContext = { f, file, options: schema.options, registry, generated };
    for (const desc of enums) {
      emitEnum(ctx, desc);
    }
    for (const desc of messages) {
      emitMessage(ctx, desc);
    }
    for (const service of file.services) {
      emitServiceCodecs(ctx, service);
    }
  }
}
