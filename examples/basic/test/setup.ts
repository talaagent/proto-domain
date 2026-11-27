// Node has no native Temporal yet: use the polyfill. With native Temporal,
// skip this; the runtime picks up globalThis.Temporal.
import { configureTemporal } from "@talaagent/proto-domain";
import { Temporal } from "temporal-polyfill";

configureTemporal(Temporal);
