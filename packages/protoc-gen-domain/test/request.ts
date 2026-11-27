// Runs the plugin in-process on the fixture image that `pnpm generate` builds
// (test/fixtures.binpb, a FileDescriptorSet with all imports).

import { readFileSync } from "node:fs";
import { create, fromBinary } from "@bufbuild/protobuf";
import {
  CodeGeneratorRequestSchema,
  type FileDescriptorProto,
  FileDescriptorSetSchema,
} from "@bufbuild/protobuf/wkt";

import { protocGenDomain } from "../src/index.js";

export function fixtureFiles(): FileDescriptorProto[] {
  const bytes = readFileSync(new URL("fixtures.binpb", import.meta.url));
  return fromBinary(FileDescriptorSetSchema, bytes).file;
}

/** The plugin's output files by name, for the given parameter and protos. */
export function runPlugin(
  parameter: string,
  protoFile: FileDescriptorProto[] = fixtureFiles(),
  fileToGenerate: string[] = protoFile
    .map((file) => file.name)
    .filter((name) => name.startsWith("fixtures/")),
): Map<string, string> {
  const request = create(CodeGeneratorRequestSchema, { parameter, protoFile, fileToGenerate });
  const response = protocGenDomain.run(request);
  if (response.error !== undefined && response.error !== "") {
    throw new Error(response.error);
  }
  return new Map(response.file.map((file) => [file.name, file.content]));
}
