// protoc-gen-domain: domain TypeScript over protobuf-es. See the README.

import { createEcmaScriptPlugin } from "@bufbuild/protoplugin";

import { generateTs } from "./generate.js";
import { type Options, parseOptions } from "./options.js";
import { version } from "./version.js";

export type { EnumStyle, Options } from "./options.js";

export const protocGenDomain: ReturnType<typeof createEcmaScriptPlugin<Options>> =
  createEcmaScriptPlugin<Options>({
    name: "protoc-gen-domain",
    version: `v${version}`,
    parseOptions,
    generateTs,
  });
