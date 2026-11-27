// The tests run on temporal-polyfill; native Temporal takes the same path
// through globalThis.Temporal.
import { Temporal } from "temporal-polyfill";
import { configureTemporal } from "../src/temporal.js";

configureTemporal(Temporal);
