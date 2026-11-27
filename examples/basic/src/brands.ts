// The brand types the generated code imports (brand_import=../brands.js, relative to src/gen).
// Any nominal type over the scalar works; this is the runtime's.
import type { Brand } from "@talaagent/proto-domain";

/** A task's id: a string that can't be mixed up with other ids. */
export type TaskId = Brand<string, "TaskId">;
