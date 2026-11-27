// The round-trip tests run the generated code on temporal-polyfill.
import { configureTemporal } from "@talaagent/proto-domain";
import { Temporal } from "temporal-polyfill";

configureTemporal(Temporal);
