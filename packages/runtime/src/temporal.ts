// Which Temporal implementation the converters construct values with. The
// runtime never imports one itself: native Temporal, temporal-polyfill, or any
// other implementation of the spec works.

import type { Temporal as TemporalSpec } from "temporal-spec";

/** The Temporal API's types (from temporal-spec, the same types temporal-polyfill exports). */
export type { Temporal } from "temporal-spec";

/** The `Temporal` namespace object: native `globalThis.Temporal`, or temporal-polyfill's export. */
export type TemporalNamespace = typeof TemporalSpec;

let configured: TemporalNamespace | undefined;

/**
 * Make the converters use this Temporal implementation, e.g.
 * `configureTemporal(Temporal)` after `import { Temporal } from "temporal-polyfill"`.
 * Without a call, they use `globalThis.Temporal` (native Temporal, or
 * `import "temporal-polyfill/global"`).
 */
export function configureTemporal(implementation: TemporalNamespace): void {
  configured = implementation;
}

/** The configured Temporal, else `globalThis.Temporal`; throws when there is neither. */
export function temporal(): TemporalNamespace {
  if (configured !== undefined) {
    return configured;
  }
  const global: unknown = Reflect.get(globalThis, "Temporal");
  if (global === undefined) {
    throw new Error(
      "@talaagent/proto-domain: no Temporal implementation. Use a runtime with native Temporal, " +
        'import "temporal-polyfill/global", or call configureTemporal(Temporal).',
    );
  }
  return global as TemporalNamespace;
}
